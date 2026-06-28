// ──────────────────────────────────────────────────────────────────────────────
// indicators/stochRsi.js
// Self-registering Stochastic RSI indicator definition.
// Multi-output (%K and %D lines) in a separate pane.
// All parameters extracted from inputs at calculation runtime.
// ──────────────────────────────────────────────────────────────────────────────

import IndicatorRegistry from '../IndicatorRegistry';

/**
 * Pure Stochastic RSI calculation.
 * Computes RSI first, then applies stochastic oscillator on top.
 * @param {Array} candles — OHLCV array
 * @param {Object} inputs — { rsiLength, stochLength, smoothK, smoothD }
 * @returns {{ k: Array<{ time, value }>, d: Array<{ time, value }> }}
 */
function calculate(candles, inputs) {
  const rsiLength = inputs.rsiLength ?? 14;
  const stochLength = inputs.stochLength ?? 14;
  const smoothK = inputs.smoothK ?? 3;
  const smoothD = inputs.smoothD ?? 3;

  // Step 1: Compute RSI values
  const rsiData = [];
  if (candles.length < rsiLength + 1) return { k: [], d: [] };

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= rsiLength; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / rsiLength;
  let avgLoss = losses / rsiLength;
  let rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  rsiData.push({ time: candles[rsiLength].time, value: rsiVal });

  for (let i = rsiLength + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (rsiLength - 1) + gain) / rsiLength;
    avgLoss = (avgLoss * (rsiLength - 1) + loss) / rsiLength;

    rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    rsiData.push({ time: candles[i].time, value: rsiVal });
  }

  // Step 2: Stochastic on RSI
  if (rsiData.length < stochLength) return { k: [], d: [] };

  const stochRaw = [];
  for (let i = 0; i < rsiData.length; i++) {
    if (i < stochLength - 1) continue;
    const window = rsiData.slice(i - stochLength + 1, i + 1).map((d) => d.value);
    const minRsi = Math.min(...window);
    const maxRsi = Math.max(...window);

    let stochVal = 0;
    if (maxRsi - minRsi !== 0) {
      stochVal = ((rsiData[i].value - minRsi) / (maxRsi - minRsi)) * 100;
    }
    stochRaw.push({ time: rsiData[i].time, rawValue: stochVal });
  }

  // Step 3: Smooth %K
  const kData = [];
  for (let i = 0; i < stochRaw.length; i++) {
    if (i < smoothK - 1) continue;
    const window = stochRaw.slice(i - smoothK + 1, i + 1).map((d) => d.rawValue);
    const kVal = window.reduce((a, b) => a + b, 0) / smoothK;
    kData.push({ time: stochRaw[i].time, value: kVal });
  }

  // Step 4: Smooth %D
  const dData = [];
  for (let i = 0; i < kData.length; i++) {
    if (i < smoothD - 1) continue;
    const window = kData.slice(i - smoothD + 1, i + 1).map((d) => d.value);
    const dVal = window.reduce((a, b) => a + b, 0) / smoothD;
    dData.push({ time: kData[i].time, value: dVal });
  }

  return { k: kData, d: dData };
}

/**
 * Creates two LineSeries (%K and %D) on a separate pane.
 * @param {Object} chart
 * @param {Object} inputs
 * @returns {{ k: Object, d: Object }}
 */
function seriesFactory(chart, inputs) {
  const kSeries = chart.addLineSeries({
    color: inputs.kColor ?? '#3B82F6',
    lineWidth: inputs.kLineWidth ?? 1.5,
    priceLineVisible: false,
    title: '%K',
  });

  const dSeries = chart.addLineSeries({
    color: inputs.dColor ?? '#F97316',
    lineWidth: inputs.dLineWidth ?? 1.5,
    priceLineVisible: false,
    title: '%D',
  });

  return { k: kSeries, d: dSeries };
}

IndicatorRegistry.register('stochRsi', {
  name: 'Stochastic RSI',
  paneType: 'separate',
  defaultInputs: {
    rsiLength: 14,
    stochLength: 14,
    smoothK: 3,
    smoothD: 3,
    kColor: '#3B82F6',
    dColor: '#F97316',
    kLineWidth: 1.5,
    dLineWidth: 1.5,
  },
  outputs: ['k', 'd'],
  referenceLines: [
    { price: 80, color: 'rgba(244, 63, 94, 0.25)', lineWidth: 1, lineStyle: 1 },
    { price: 20, color: 'rgba(52, 211, 153, 0.25)', lineWidth: 1, lineStyle: 1 },
  ],
  calculate,
  seriesFactory,
});
