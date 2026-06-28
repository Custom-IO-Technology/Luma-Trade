// ──────────────────────────────────────────────────────────────────────────────
// indicators/rsi.js
// Self-registering RSI indicator definition.
// Renders in a separate pane with configurable overbought/oversold reference lines.
// ──────────────────────────────────────────────────────────────────────────────

import IndicatorRegistry from '../IndicatorRegistry';

/**
 * Pure RSI calculation.
 * @param {Array} candles — OHLCV array
 * @param {Object} inputs — { length: number }
 * @returns {{ value: Array<{ time, value }> }}
 */
function calculate(candles, inputs) {
  const length = inputs.length ?? 14;
  const result = [];

  if (candles.length < length + 1) return { value: result };

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;
  let rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: candles[length].time, value: rsiVal });

  for (let i = length + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i].time, value: rsiVal });
  }

  return { value: result };
}

/**
 * Creates a LineSeries on a separate pane for RSI.
 * @param {Object} chart — lightweight-charts chart instance (the separate pane)
 * @param {Object} inputs
 * @returns {{ value: Object }}
 */
function seriesFactory(chart, inputs) {
  const series = chart.addLineSeries({
    color: inputs.color ?? '#A855F7',
    lineWidth: inputs.lineWidth ?? 2,
    priceLineVisible: false,
    title: `RSI ${inputs.length ?? 14}`,
  });
  return { value: series };
}

IndicatorRegistry.register('rsi', {
  name: 'Relative Strength Index',
  paneType: 'separate',
  defaultInputs: {
    length: 14,
    color: '#A855F7',
    lineWidth: 2,
    overbought: 70,
    oversold: 30,
  },
  outputs: ['value'],
  referenceLines: [
    { price: 70, color: 'rgba(244, 63, 94, 0.3)', lineWidth: 1, lineStyle: 1 },
    { price: 30, color: 'rgba(52, 211, 153, 0.3)', lineWidth: 1, lineStyle: 1 },
  ],
  calculate,
  seriesFactory,
});
