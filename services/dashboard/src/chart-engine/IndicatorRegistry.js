// ──────────────────────────────────────────────────────────────────────────────
// IndicatorRegistry.js
// Central Map<string, IndicatorDefinition> singleton.
// Indicators self-register via IndicatorRegistry.register(id, definition).
// No hardcoded logic — the registry is purely structural.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ReferenceLineConfig
 * @property {number} price      — Y-axis value for the line
 * @property {string} color      — CSS color string
 * @property {number} lineWidth  — Pixel width
 * @property {number} lineStyle  — 0=solid, 1=dotted, 2=dashed
 */

/**
 * @typedef {Object} IndicatorDefinition
 * @property {string}   id             — Unique identifier ('ema', 'rsi', etc.)
 * @property {string}   name           — Human-readable label
 * @property {'overlay'|'separate'} paneType — Where to render
 * @property {Object}   defaultInputs  — Default parameter map (length, source, color, etc.)
 * @property {string[]} outputs        — Output keys (e.g. ['value'] or ['k', 'd'])
 * @property {ReferenceLineConfig[]} [referenceLines] — Static horizontal lines on the pane
 * @property {function(candles: Array, inputs: Object): Object} calculate
 *   Pure function: receives OHLCV candles + resolved inputs, returns { [outputKey]: seriesData[] }
 * @property {function(chart: Object, inputs: Object): Object} seriesFactory
 *   Creates lightweight-charts series on the given chart, returns { [outputKey]: seriesRef }
 */

class IndicatorRegistryClass {
  constructor() {
    /** @type {Map<string, IndicatorDefinition>} */
    this._registry = new Map();
  }

  /**
   * Register an indicator definition.
   * @param {string} id
   * @param {IndicatorDefinition} definition
   */
  register(id, definition) {
    if (this._registry.has(id)) {
      console.warn(`[IndicatorRegistry] Overwriting existing indicator: ${id}`);
    }
    this._registry.set(id, { ...definition, id });
  }

  /**
   * Retrieve a registered definition by ID.
   * @param {string} id
   * @returns {IndicatorDefinition}
   */
  get(id) {
    const def = this._registry.get(id);
    if (!def) {
      throw new Error(`[IndicatorRegistry] Unknown indicator: "${id}". Registered: [${this.list().join(', ')}]`);
    }
    return def;
  }

  /**
   * Check if an indicator is registered.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._registry.has(id);
  }

  /**
   * List all registered indicator IDs.
   * @returns {string[]}
   */
  list() {
    return Array.from(this._registry.keys());
  }

  /**
   * Get all registered definitions.
   * @returns {IndicatorDefinition[]}
   */
  getAll() {
    return Array.from(this._registry.values());
  }
}

// Singleton instance — shared across the entire app
const IndicatorRegistry = new IndicatorRegistryClass();

export default IndicatorRegistry;
