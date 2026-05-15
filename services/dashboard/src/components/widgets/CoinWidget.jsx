import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createChart } from 'lightweight-charts';
import { useMarketStore } from '../../stores/marketStore';
import { useScoreStore } from '../../stores/scoreStore';

const CoinWidget = forwardRef(({ symbol }, ref) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const timeframe = useMarketStore(state => state.timeframe);

  useImperativeHandle(ref, () => ({
    takeScreenshot: () => {
      if (chartRef.current) {
        return chartRef.current.takeScreenshot().toDataURL();
      }
      return null;
    }
  }));

  // ── Chart initialisation (once per mount) ──────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: '#0A0A0C' },
        textColor: '#d1d5db',
        fontSize: 10,
        fontFamily: 'IBM Plex Mono',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      rightPriceScale: { borderColor: '#27272A' },
      timeScale: { borderColor: '#27272A', timeVisible: true },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      handleScroll: false,
      handleScale: false,
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

    chart.applyOptions({
      crosshair: {
        mode: 0,
        vertLine: { labelVisible: true },
        horzLine: { labelVisible: true },
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (!chartContainerRef.current) return;
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // ── Data pipeline: history load + live WebSocket (reconnects on symbol/timeframe) ──
  // 
  // CRITICAL PATTERN: WebSocket ticks must NOT arrive before setData() has painted
  // history. If update() is called on an empty series, it creates an orphaned candle.
  // When setData() then arrives, it replaces everything — but the user sees a flicker,
  // and timestamp alignment breaks. Solution: buffer WS ticks until history is loaded.
  useEffect(() => {
    const setHistory = useMarketStore.getState().setHistory;
    const setScore = useScoreStore.getState().setScore;
    const addTick = useMarketStore.getState().addTick;

    let historyLoaded = false;
    const pendingTicks = []; // Buffer for ticks that arrive before history

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/stream/${symbol}?interval=${timeframe}`;

    // 1. Cold start — fetch history, paint chart, THEN flush any queued ticks
    fetch(`/api/history/${symbol}?interval=${timeframe}`)
      .then(r => r.json())
      .then(hist => {
        if (hist.data?.length > 0 && candleSeriesRef.current) {
          candleSeriesRef.current.setData(hist.data);
          chartRef.current?.timeScale().fitContent();
          setHistory(symbol, hist.data);
        }
        // Mark history as loaded and flush any buffered ticks
        historyLoaded = true;
        for (const tick of pendingTicks) {
          if (candleSeriesRef.current) {
            candleSeriesRef.current.update(tick);
          }
          addTick(symbol, tick);
        }
        pendingTicks.length = 0;
      })
      .catch(err => {
        console.error('[CoinWidget] History fetch failed:', err);
        // Even on failure, unblock the WS pipeline so the chart can still show live data
        historyLoaded = true;
        for (const tick of pendingTicks) {
          if (candleSeriesRef.current) {
            candleSeriesRef.current.update(tick);
          }
          addTick(symbol, tick);
        }
        pendingTicks.length = 0;
      });

    fetch(`/api/widgets/score/${symbol}?interval=${timeframe}`)
      .then(r => r.json())
      .then(score => setScore(symbol, score))
      .catch(() => {});

    // 2. Live stream — connect WebSocket, write directly to canvas
    // Ticks are buffered until history has been loaded to prevent orphaned candles
    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[CoinWidget] WS open: ${symbol} @ ${timeframe}`);
        reconnectDelayRef.current = 1000;
        useMarketStore.setState(state => ({
          symbols: {
            ...state.symbols,
            [symbol]: { ...state.symbols[symbol], wsStatus: 'connected' }
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'kline_update') {
            if (!historyLoaded) {
              // Buffer tick until history is loaded — prevents orphaned candles
              pendingTicks.push(msg.data);
              return;
            }
            // DIRECT canvas write — bypasses React entirely (the "TradingView effect")
            // If msg.data.time === last candle's time → morphs in-place
            // If msg.data.time > last candle's time → draws a new candle
            if (candleSeriesRef.current) {
              candleSeriesRef.current.update(msg.data);
            }
            // Still update store for UI elements (price display, etc.)
            addTick(symbol, msg.data);
          } else if (msg.type === 'score_update') {
            setScore(symbol, msg);
          }
        } catch (err) {
          console.error('[CoinWidget] WS message error:', err);
        }
      };

      ws.onclose = () => {
        useMarketStore.setState(state => ({
          symbols: {
            ...state.symbols,
            [symbol]: { ...state.symbols[symbol], wsStatus: 'disconnected' }
          }
        }));
        // Exponential backoff reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [symbol, timeframe]);

  return (
    <div className="w-full h-full relative" ref={chartContainerRef} />
  );
});

export default CoinWidget;
