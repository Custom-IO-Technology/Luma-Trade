// ──────────────────────────────────────────────────────────────────────────────
// ChartState.js
// Mutable state model that drives the charting engine.
// Owns: activeIndicators[], candles[], computedSeries{}.
// Emits onChange() after any mutation to trigger canvas re-draws.
// ──────────────────────────────────────────────────────────────────────────────

import IndicatorRegistry from './IndicatorRegistry';

let _instanceCounter = 0;

export default class ChartState {
  /**
   * @param {Array} initialIndicators — Array of { id, instanceId?, inputs? }
   */
  constructor(initialIndicators = []) {
    /** @type {Array<{ id: string, instanceId: string, inputs: Object }>} */
    this.activeIndicators = initialIndicators.map((ind) => this._resolveIndicator(ind));

    /** @type {Array} OHLCV source data */
    this.candles = [];

    /** @type {Object<string, Object>} instanceId → { [outputKey]: seriesData[] } */
    this.computedSeries = {};

    /** @type {Set<Function>} Change listeners */
    this._listeners = new Set();

    /** @type {boolean} Batching flag to coalesce multiple mutations */
    this._batching = false;

    /** @type {boolean} Whether a notification is pending during batch */
    this._dirty = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Add a new indicator instance with optional input overrides.
   * @param {string} id — Registered indicator type ID
   * @param {Object} [inputOverrides] — Merge over defaultInputs
   * @returns {string} The generated instanceId
   */
  addIndicator(id, inputOverrides = {}) {
    const resolved = this._resolveIndicator({ id, inputs: inputOverrides });
    this.activeIndicators.push(resolved);
    this.compute();
    this._notify('add');
    return resolved.instanceId;
  }

  /**
   * Remove an indicator instance by its instanceId.
   * @param {string} instanceId
   */
  removeIndicator(instanceId) {
    const idx = this.activeIndicators.findIndex((ind) => ind.instanceId === instanceId);
    if (idx === -1) {
      console.warn(`[ChartState] Cannot remove unknown instance: ${instanceId}`);
      return;
    }
    this.activeIndicators.splice(idx, 1);
    delete this.computedSeries[instanceId];
    this._notify('remove');
  }

  /**
   * Update the inputs of a specific indicator instance.
   * Merges newInputs into existing inputs, recomputes, and forces re-draw.
   * @param {string} instanceId
   * @param {Object} newInputs — Partial input overrides
   */
  updateIndicatorInputs(instanceId, newInputs) {
    const ind = this.activeIndicators.find((i) => i.instanceId === instanceId);
    if (!ind) {
      console.warn(`[ChartState] Cannot update unknown instance: ${instanceId}`);
      return;
    }
    ind.inputs = { ...ind.inputs, ...newInputs };
    this._computeSingle(ind);
    this._notify('inputChange');
  }

  /**
   * Replace all source candle data and recompute all indicators.
   * @param {Array} candles — Full OHLCV array
   */
  setCandles(candles) {
    this.candles = candles;
    this.compute();
    this._notify('setCandles');
  }

  /**
   * Append or update the last candle (for realtime WebSocket ticks).
   * If the new candle's time matches the last candle, it overwrites (morph).
   * Otherwise it appends.
   * @param {Object} candle — Single OHLCV candle
   */
  appendCandle(candle) {
    if (this.candles.length === 0) {
      this.candles.push(candle);
    } else {
      const last = this.candles[this.candles.length - 1];
      if (last.time === candle.time) {
        this.candles[this.candles.length - 1] = candle;
      } else {
        this.candles.push(candle);
      }
    }
    this.compute();
    this._notify('appendCandle');
  }

  /**
   * Recompute all indicators from current candles.
   * Stores results in computedSeries keyed by instanceId.
   */
  compute() {
    for (const ind of this.activeIndicators) {
      this._computeSingle(ind);
    }
  }

  /**
   * Register a change listener.
   * The callback receives (eventType: string) after any state mutation.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Begin a batch of mutations. Notifications are coalesced until endBatch().
   */
  beginBatch() {
    this._batching = true;
    this._dirty = false;
  }

  /**
   * End the current batch. Fires a single notification if any mutation occurred.
   */
  endBatch() {
    this._batching = false;
    if (this._dirty) {
      this._dirty = false;
      this._emit('batch');
    }
  }

  /**
   * Get a snapshot of computed data for a specific instance.
   * @param {string} instanceId
   * @returns {Object|null} — { [outputKey]: seriesData[] }
   */
  getComputedData(instanceId) {
    return this.computedSeries[instanceId] ?? null;
  }

  /**
   * Get all indicator instances, enriched with their registry definitions.
   * @returns {Array<{ id, instanceId, inputs, definition }>}
   */
  getEnrichedIndicators() {
    return this.activeIndicators.map((ind) => ({
      ...ind,
      definition: IndicatorRegistry.get(ind.id),
    }));
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /**
   * Resolve an indicator config into a full instance with merged defaults.
   * @param {{ id: string, instanceId?: string, inputs?: Object }} config
   * @returns {{ id: string, instanceId: string, inputs: Object }}
   */
  _resolveIndicator(config) {
    const definition = IndicatorRegistry.get(config.id);
    const instanceId = config.instanceId || `${config.id}-${_instanceCounter++}`;
    const inputs = { ...definition.defaultInputs, ...(config.inputs || {}) };
    return { id: config.id, instanceId, inputs };
  }

  /**
   * Compute a single indicator and store results.
   * @param {{ id: string, instanceId: string, inputs: Object }} ind
   */
  _computeSingle(ind) {
    const definition = IndicatorRegistry.get(ind.id);
    try {
      this.computedSeries[ind.instanceId] = definition.calculate(this.candles, ind.inputs);
    } catch (err) {
      console.error(`[ChartState] Calculation failed for ${ind.instanceId}:`, err);
      this.computedSeries[ind.instanceId] = {};
    }
  }

  /**
   * Notify all listeners of a state change.
   * @param {string} eventType
   */
  _notify(eventType) {
    if (this._batching) {
      this._dirty = true;
      return;
    }
    this._emit(eventType);
  }

  /**
   * Fire the actual event to all listeners.
   * @param {string} eventType
   */
  _emit(eventType) {
    for (const cb of this._listeners) {
      try {
        cb(eventType);
      } catch (err) {
        console.error('[ChartState] Listener error:', err);
      }
    }
  }
}
