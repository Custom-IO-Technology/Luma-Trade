// ──────────────────────────────────────────────────────────────────────────────
// indicators/ema.js
// Self-registering EMA indicator definition.
// All parameters (length, source, color) are extracted from inputs at runtime.
// ──────────────────────────────────────────────────────────────────────────────

import IndicatorRegistry from '../IndicatorRegistry';

/**
 * Pure EMA calculation.
 * @param {Array} candles — OHLCV array with { time, open, high, low, close, volume }
 * @param {Object} inputs — { length: number, source: string }
 * @returns {{ value: Array<{ time, value }> }}
 */
function calculate(candles, inputs) {
  const length = inputs.length ?? 9;
  const source = inputs.source ?? 'close';

  if (candles.length < length) return { value: [] };

  const k = 2 / (length + 1);
  let emaVal = candles[0][source];
  const result = [{ time: candles[0].time, value: emaVal }];

  for (let i = 1; i < candles.length; i++) {
    emaVal = candles[i][source] * k + emaVal * (1 - k);
    result.push({ time: candles[i].time, value: emaVal });
  }

  return { value: result };
}

/**
 * Creates a LineSeries on the given chart for this EMA instance.
 * @param {Object} chart — lightweight-charts chart instance
 * @param {Object} inputs — { color, lineWidth, ... }
 * @returns {{ value: Object }} — map of output key to series reference
 */
function seriesFactory(chart, inputs) {
  const series = chart.addLineSeries({
    color: inputs.color ?? '#FFD700',
    lineWidth: inputs.lineWidth ?? 1.5,
    priceLineVisible: false,
    lastValueVisible: false,
    title: `EMA ${inputs.length ?? 9}`,
  });
  return { value: series };
}

IndicatorRegistry.register('ema', {
  name: 'Exponential Moving Average',
  paneType: 'overlay',
  defaultInputs: {
    length: 9,
    source: 'close',
    color: '#FFD700',
    lineWidth: 1.5,
  },
  outputs: ['value'],
  calculate,
  seriesFactory,
});
