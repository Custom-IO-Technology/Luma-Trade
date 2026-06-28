// ──────────────────────────────────────────────────────────────────────────────
// chart-engine/index.js
// Barrel export + convenience factory for the chart engine pipeline.
// ──────────────────────────────────────────────────────────────────────────────

// Trigger all indicator self-registrations (side-effect imports)
import './indicators/index';

// Core exports
import IndicatorRegistry from './IndicatorRegistry';
import ChartState from './ChartState';
import CanvasLayoutEngine from './CanvasLayoutEngine';

export { IndicatorRegistry, ChartState, CanvasLayoutEngine };

/**
 * Default active indicators configuration.
 * Matches the original ChartFullView hardcoded setup.
 */
export const DEFAULT_INDICATORS = [
  { id: 'ema', instanceId: 'ema-9', inputs: { length: 9, source: 'close', color: '#FFD700' } },
  { id: 'ema', instanceId: 'ema-21', inputs: { length: 21, source: 'close', color: '#FF8C00' } },
  { id: 'volume', instanceId: 'vol-0', inputs: {} },
  { id: 'rsi', instanceId: 'rsi-14', inputs: { length: 14 } },
  { id: 'stochRsi', instanceId: 'srsi-0', inputs: { rsiLength: 14, stochLength: 14, smoothK: 3, smoothD: 3 } },
];

/**
 * Convenience factory — creates and mounts a fully wired chart engine.
 *
 * @param {HTMLElement} container — DOM element to mount into
 * @param {Array} [initialIndicators] — Array of { id, instanceId?, inputs? }
 * @returns {{ chartState: ChartState, layoutEngine: CanvasLayoutEngine }}
 *
 * @example
 *   const { chartState, layoutEngine } = createChartEngine(containerEl);
 *
 *   // Load candles
 *   chartState.setCandles(ohlcvArray);
 *   layoutEngine.refresh();
 *   layoutEngine.fitContent();
 *
 *   // Update indicator on the fly — forces canvas re-draw
 *   chartState.updateIndicatorInputs('ema-9', { length: 50 });
 *
 *   // Cleanup
 *   layoutEngine.destroy();
 */
export function createChartEngine(container, initialIndicators = DEFAULT_INDICATORS) {
  const chartState = new ChartState(initialIndicators);
  const layoutEngine = new CanvasLayoutEngine(container, chartState);
  layoutEngine.mount();

  return { chartState, layoutEngine };
}
