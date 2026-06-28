// ──────────────────────────────────────────────────────────────────────────────
// indicators/volume.js
// Self-registering Volume histogram indicator.
// Renders as overlay on the price pane with a separate Y-axis scale.
// ──────────────────────────────────────────────────────────────────────────────

import IndicatorRegistry from '../IndicatorRegistry';

/**
 * Pure volume calculation.
 * Returns histogram data with bullish/bearish color mapping.
 * @param {Array} candles — OHLCV array
 * @param {Object} inputs — { upColor, downColor }
 * @returns {{ value: Array<{ time, value, color }> }}
 */
function calculate(candles, inputs) {
  const upColor = inputs.upColor ?? 'rgba(52, 211, 153, 0.25)';
  const downColor = inputs.downColor ?? 'rgba(244, 63, 94, 0.25)';

  const result = candles.map((c) => ({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? upColor : downColor,
  }));

  return { value: result };
}

/**
 * Creates a HistogramSeries on the price chart with a dedicated volume scale.
 * @param {Object} chart
 * @param {Object} inputs
 * @returns {{ value: Object }}
 */
function seriesFactory(chart, inputs) {
  const series = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume-scale',
  });

  chart.priceScale('volume-scale').applyOptions({
    scaleMargins: {
      top: inputs.scaleTop ?? 0.8,
      bottom: inputs.scaleBottom ?? 0,
    },
  });

  return { value: series };
}

IndicatorRegistry.register('volume', {
  name: 'Volume',
  paneType: 'overlay',
  defaultInputs: {
    upColor: 'rgba(52, 211, 153, 0.25)',
    downColor: 'rgba(244, 63, 94, 0.25)',
    scaleTop: 0.8,
    scaleBottom: 0,
  },
  outputs: ['value'],
  calculate,
  seriesFactory,
});
