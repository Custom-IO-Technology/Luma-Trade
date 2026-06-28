// ──────────────────────────────────────────────────────────────────────────────
// CanvasLayoutEngine.js
// Reads ChartState.activeIndicators to derive the canvas layout dynamically.
// Creates panes (price + N separate indicator panes), binds series,
// synchronizes time scales and crosshairs across all panes.
// ──────────────────────────────────────────────────────────────────────────────

import { createChart } from 'lightweight-charts';
import IndicatorRegistry from './IndicatorRegistry';

/** Shared chart theme — matches the Lumina Trade dark design system */
const CHART_THEME = {
  layout: {
    background: { type: 'solid', color: '#0A0A0C' },
    textColor: '#a1a1aa',
    fontSize: 10,
    fontFamily: 'IBM Plex Mono',
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
  },
  rightPriceScale: { borderColor: '#1F2330', minimumWidth: 80 },
  timeScale: { borderColor: '#1F2330', timeVisible: true },
};

export default class CanvasLayoutEngine {
  /**
   * @param {HTMLElement} container — The root container element
   * @param {import('./ChartState').default} chartState — The state model
   */
  constructor(container, chartState) {
    /** @type {HTMLElement} */
    this._container = container;

    /** @type {import('./ChartState').default} */
    this._chartState = chartState;

    // ── Runtime state ──

    /** @type {Object|null} The main price chart (lightweight-charts instance) */
    this.priceChart = null;

    /** @type {Object|null} The candlestick series on the price chart */
    this.candleSeries = null;

    /** @type {Array<{ paneId: string, chart: Object, container: HTMLElement, indicators: Array }>} */
    this._panes = [];

    /**
     * Maps instanceId → { [outputKey]: seriesRef }
     * @type {Object<string, Object>}
     */
    this._seriesRefs = {};

    /** @type {Array<HTMLElement>} Dynamically created sub-container divs */
    this._paneContainers = [];

    /** @type {boolean} Whether the engine has been mounted */
    this._mounted = false;

    /** @type {Function|null} Unsubscribe from ChartState.onChange */
    this._unsubscribe = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initial mount — builds all panes from current state.
   * Call once after constructing the engine.
   */
  mount() {
    if (this._mounted) return;
    this._mounted = true;
    this._build();

    // Subscribe to state changes for automatic refresh
    this._unsubscribe = this._chartState.onChange((eventType) => {
      if (eventType === 'add' || eventType === 'remove' || eventType === 'batch') {
        this.rebuild();
      } else {
        this.refresh();
      }
    });
  }

  /**
   * Tear down all charts and rebuild from scratch.
   * Called when indicators are added/removed (pane count changes).
   */
  rebuild() {
    // Preserve existing candle data reference — no need to re-fetch
    this._teardownCharts();
    this._clearContainers();
    this._build();
    this.refresh();
  }

  /**
   * Update existing series data from computedSeries.
   * No chart teardown — just pushes new data arrays to existing series.
   * Called on input changes, new candles, etc.
   */
  refresh() {
    if (!this.priceChart) return;

    // Update candlestick series
    const candles = this._chartState.candles;
    if (candles.length > 0 && this.candleSeries) {
      this.candleSeries.setData(candles);
    }

    // Update each indicator's series data
    for (const ind of this._chartState.activeIndicators) {
      const computed = this._chartState.getComputedData(ind.instanceId);
      const seriesRefs = this._seriesRefs[ind.instanceId];
      if (!computed || !seriesRefs) continue;

      const definition = IndicatorRegistry.get(ind.id);
      for (const outputKey of definition.outputs) {
        const data = computed[outputKey];
        const series = seriesRefs[outputKey];
        if (data && series) {
          series.setData(data);
        }
      }
    }
  }

  /**
   * Fit all panes' time scales to show all data.
   */
  fitContent() {
    if (this.priceChart) {
      this.priceChart.timeScale().fitContent();
    }
    for (const pane of this._panes) {
      pane.chart.timeScale().fitContent();
    }
  }

  /**
   * Handle window resize — update all chart dimensions.
   */
  resize() {
    this._resizeAllCharts();
  }

  /**
   * Full cleanup — remove all charts and DOM elements.
   */
  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._teardownCharts();
    this._clearContainers();
    this._mounted = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL — Build Pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Full build pipeline:
   * 1. Derive pane layout from activeIndicators
   * 2. Create container DOM elements
   * 3. Create charts
   * 4. Create series (candlesticks + indicator series)
   * 5. Sync time scales and crosshairs
   * 6. Create reference lines
   */
  _build() {
    const enriched = this._chartState.getEnrichedIndicators();

    // Partition indicators by pane type
    const overlays = enriched.filter((e) => e.definition.paneType === 'overlay');
    const separateGroups = this._groupSeparateIndicators(enriched);

    // 1. Create DOM containers
    this._createContainers(separateGroups.length);

    // 2. Build price chart (main pane — always exists)
    this._buildPriceChart();

    // 3. Attach overlay indicators to price chart
    for (const ind of overlays) {
      this._createIndicatorSeries(this.priceChart, ind);
    }

    // 4. Build separate panes for each group
    for (let i = 0; i < separateGroups.length; i++) {
      const group = separateGroups[i];
      const paneContainer = this._paneContainers[i + 1]; // +1 because [0] is price pane
      const isLast = i === separateGroups.length - 1;

      const chart = this._createSubChart(paneContainer, isLast);
      const pane = {
        paneId: `pane-${i}`,
        chart,
        container: paneContainer,
        indicators: group,
      };
      this._panes.push(pane);

      // Create indicator series on this pane
      for (const ind of group) {
        this._createIndicatorSeries(chart, ind);
        this._createReferenceLines(chart, ind);
      }
    }

    // 5. Sync time scales and crosshairs across all panes
    this._setupTimeSync();
    this._setupCrosshairSync();
  }

  /**
   * Group separate-pane indicators that share the same pane.
   * Currently each separate indicator gets its own pane, but this structure
   * allows future grouping (e.g., two oscillators on one pane).
   * @param {Array} enriched
   * @returns {Array<Array>} Array of indicator groups
   */
  _groupSeparateIndicators(enriched) {
    const separates = enriched.filter((e) => e.definition.paneType === 'separate');
    // Each separate indicator gets its own pane
    return separates.map((ind) => [ind]);
  }

  /**
   * Create the DOM container elements for all panes.
   * Index 0 is the price pane, subsequent indices are separate panes.
   * @param {number} separatePaneCount
   */
  _createContainers(separatePaneCount) {
    // Clear any existing children
    this._container.innerHTML = '';

    // Calculate flex proportions: price pane gets 60%, rest splits 40%
    const totalPanes = 1 + separatePaneCount;
    const priceFlex = separatePaneCount > 0 ? 6 : 10;
    const separateFlex = separatePaneCount > 0 ? Math.max(2, Math.floor(4 / separatePaneCount)) : 0;

    // Price pane container
    const priceDiv = document.createElement('div');
    priceDiv.style.cssText = `flex: ${priceFlex}; min-height: 0; position: relative;`;
    priceDiv.className = 'chart-pane chart-pane-price';
    this._container.appendChild(priceDiv);
    this._paneContainers.push(priceDiv);

    // Separate pane containers
    for (let i = 0; i < separatePaneCount; i++) {
      const sepDiv = document.createElement('div');
      sepDiv.style.cssText = `flex: ${separateFlex}; min-height: 0; position: relative; border-top: 1px solid rgba(31, 35, 48, 0.5); padding-top: 4px;`;
      sepDiv.className = `chart-pane chart-pane-sep-${i}`;
      this._container.appendChild(sepDiv);
      this._paneContainers.push(sepDiv);
    }

    // Derive dynamic labels for each pane
    this._createPaneLabels(separatePaneCount);
  }

  /**
   * Create floating pane labels (e.g. "EMA(9, 21) | Volume", "RSI (14)").
   * @param {number} separatePaneCount
   */
  _createPaneLabels(separatePaneCount) {
    const enriched = this._chartState.getEnrichedIndicators();
    const overlays = enriched.filter((e) => e.definition.paneType === 'overlay');
    const separateGroups = this._groupSeparateIndicators(enriched);

    // Price pane label
    if (overlays.length > 0) {
      const labelParts = overlays.map((ind) => {
        if (ind.id === 'ema') return `EMA(${ind.inputs.length})`;
        if (ind.id === 'volume') return 'Volume';
        return ind.definition.name;
      });
      this._addPaneLabel(this._paneContainers[0], labelParts.join(' | '));
    }

    // Separate pane labels
    for (let i = 0; i < separateGroups.length; i++) {
      const group = separateGroups[i];
      const labelParts = group.map((ind) => {
        if (ind.id === 'rsi') return `RSI (${ind.inputs.length})`;
        if (ind.id === 'stochRsi') {
          return `Stoch RSI (${ind.inputs.rsiLength}, ${ind.inputs.smoothK}, ${ind.inputs.smoothD})`;
        }
        return ind.definition.name;
      });
      this._addPaneLabel(this._paneContainers[i + 1], labelParts.join(' | '));
    }
  }

  /**
   * Add a floating label element to a pane container.
   * @param {HTMLElement} container
   * @param {string} text
   */
  _addPaneLabel(container, text) {
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute; top: 8px; left: 8px; z-index: 10;
      padding: 2px 8px; background: rgba(11, 14, 20, 0.8);
      border: 1px solid #27272a; border-radius: 4px;
      font-size: 9px; font-family: 'IBM Plex Mono', monospace;
      color: #a1a1aa; pointer-events: none;
    `;
    label.textContent = text;
    container.appendChild(label);
  }

  /**
   * Build the main price chart with candlestick series.
   */
  _buildPriceChart() {
    const container = this._paneContainers[0];
    if (!container) return;

    const chart = createChart(container, {
      ...CHART_THEME,
      width: container.clientWidth || 600,
      height: container.clientHeight || 400,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#34d399',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#f43f5e',
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: '#34d399',
    });

    this.priceChart = chart;
    this.candleSeries = candleSeries;
  }

  /**
   * Create a sub-chart for a separate indicator pane.
   * @param {HTMLElement} container
   * @param {boolean} isLast — Whether this is the last pane (shows time axis)
   * @returns {Object} lightweight-charts instance
   */
  _createSubChart(container, isLast) {
    return createChart(container, {
      ...CHART_THEME,
      rightPriceScale: {
        borderColor: '#1F2330',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1F2330',
        visible: isLast, // Only show time axis on the last pane
        timeVisible: true,
      },
      width: container.clientWidth || 600,
      height: container.clientHeight || 150,
    });
  }

  /**
   * Create series for an indicator on a given chart.
   * @param {Object} chart — lightweight-charts instance
   * @param {Object} ind — Enriched indicator { id, instanceId, inputs, definition }
   */
  _createIndicatorSeries(chart, ind) {
    const seriesRefs = ind.definition.seriesFactory(chart, ind.inputs);
    this._seriesRefs[ind.instanceId] = seriesRefs;
  }

  /**
   * Create reference lines (e.g., RSI 70/30) on a chart.
   * @param {Object} chart
   * @param {Object} ind — Enriched indicator
   */
  _createReferenceLines(chart, ind) {
    const refLines = ind.definition.referenceLines;
    if (!refLines || refLines.length === 0) return;

    // Get the first series ref to attach price lines to
    const firstOutputKey = ind.definition.outputs[0];
    const seriesRef = this._seriesRefs[ind.instanceId]?.[firstOutputKey];
    if (!seriesRef) return;

    for (const rl of refLines) {
      // Resolve dynamic reference line values from inputs (e.g., custom overbought level)
      const price = rl.inputKey ? (ind.inputs[rl.inputKey] ?? rl.price) : rl.price;
      seriesRef.createPriceLine({
        price,
        color: rl.color,
        lineWidth: rl.lineWidth,
        lineStyle: rl.lineStyle,
        axisLabelVisible: true,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL — Synchronization
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set up bidirectional time scale sync across all panes.
   * Uses a recursion guard to prevent infinite sync loops.
   */
  _setupTimeSync() {
    const allCharts = this._getAllCharts();
    if (allCharts.length <= 1) return;

    let isSyncing = false;

    const safeSync = (targetChart, range) => {
      try {
        if (targetChart && range) {
          targetChart.timeScale().setVisibleLogicalRange(range);
        }
      } catch (_e) {
        // Swallow — range may be invalid during transitions
      }
    };

    for (const sourceChart of allCharts) {
      sourceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing || !range) return;
        isSyncing = true;
        for (const targetChart of allCharts) {
          if (targetChart !== sourceChart) {
            safeSync(targetChart, range);
          }
        }
        isSyncing = false;
      });
    }
  }

  /**
   * Set up crosshair sync across all panes.
   * When the user hovers on one pane, the crosshair appears on all others.
   */
  _setupCrosshairSync() {
    const allCharts = this._getAllCharts();
    if (allCharts.length <= 1) return;

    // Build a map of chart → its "primary" series (for setCrosshairPosition)
    const chartSeriesMap = new Map();

    // Price chart → candleSeries
    if (this.priceChart && this.candleSeries) {
      chartSeriesMap.set(this.priceChart, this.candleSeries);
    }

    // Separate panes → first indicator's first output series
    for (const pane of this._panes) {
      if (pane.indicators.length > 0) {
        const firstInd = pane.indicators[0];
        const firstOutputKey = firstInd.definition.outputs[0];
        const series = this._seriesRefs[firstInd.instanceId]?.[firstOutputKey];
        if (series) {
          chartSeriesMap.set(pane.chart, series);
        }
      }
    }

    for (const sourceChart of allCharts) {
      sourceChart.subscribeCrosshairMove((param) => {
        if (!param || !param.sourceEvent) {
          // Clear all target crosshairs
          for (const targetChart of allCharts) {
            if (targetChart !== sourceChart) {
              targetChart.clearCrosshairPosition();
            }
          }
          return;
        }

        const time = param.time;
        if (!time) {
          for (const targetChart of allCharts) {
            if (targetChart !== sourceChart) {
              targetChart.clearCrosshairPosition();
            }
          }
          return;
        }

        for (const targetChart of allCharts) {
          if (targetChart !== sourceChart) {
            const series = chartSeriesMap.get(targetChart);
            if (series) {
              targetChart.setCrosshairPosition(0, time, series);
            }
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL — Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get an array of all chart instances (price + separate panes).
   * @returns {Object[]}
   */
  _getAllCharts() {
    const charts = [];
    if (this.priceChart) charts.push(this.priceChart);
    for (const pane of this._panes) {
      charts.push(pane.chart);
    }
    return charts;
  }

  /**
   * Resize all charts to match their container dimensions.
   */
  _resizeAllCharts() {
    for (let i = 0; i < this._paneContainers.length; i++) {
      const container = this._paneContainers[i];
      const chart = i === 0 ? this.priceChart : this._panes[i - 1]?.chart;
      if (chart && container) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    }
  }

  /**
   * Remove all charts but keep container references.
   */
  _teardownCharts() {
    // Remove separate pane charts
    for (const pane of this._panes) {
      try {
        pane.chart.remove();
      } catch (_e) {}
    }
    this._panes = [];

    // Remove price chart
    if (this.priceChart) {
      try {
        this.priceChart.remove();
      } catch (_e) {}
      this.priceChart = null;
      this.candleSeries = null;
    }

    this._seriesRefs = {};
  }

  /**
   * Remove all dynamically created container elements.
   */
  _clearContainers() {
    this._container.innerHTML = '';
    this._paneContainers = [];
  }
}
