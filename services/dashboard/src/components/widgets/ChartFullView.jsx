import React, { useState, useEffect, useRef } from 'react';
import { useScoreStore } from '../../stores/scoreStore';
import { useMarketStore } from '../../stores/marketStore';
import { createChartEngine, DEFAULT_INDICATORS } from '../../chart-engine';

const AVAILABLE_INTERVALS = [
  { val: '30', label: '30M' },
  { val: '60', label: '1H' },
  { val: '240', label: '4H' },
  { val: 'D', label: '1D' },
  { val: 'W', label: '1W' },
];

const getTimeValue = (time) => {
  if (!time) return 0;
  if (typeof time === 'number') return time;
  if (typeof time === 'string') return new Date(time).getTime() / 1000;
  if (typeof time === 'object' && 'year' in time) {
    return new Date(time.year, time.month - 1, time.day).getTime() / 1000;
  }
  return 0;
};

export default function ChartFullView({ symbol, onClose }) {
  const scoreData = useScoreStore(state => state.scores[symbol]);
  const timeframe = useMarketStore(state => state.timeframe);
  const setTimeframe = useMarketStore(state => state.setTimeframe);
  const addTick = useMarketStore(state => state.addTick);
  const setScore = useScoreStore(state => state.setScore);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('engine'); // 'engine' | 'notes' | 'alerts'
  
  // Custom Drawing Tool State
  const [drawingMode, setDrawingMode] = useState('cursor'); // 'cursor' | 'horizontal' | 'trendline' | 'eraser'
  const [drawings, setDrawings] = useState([]); // [{ id, type, data, ref }]
  const [tempLineStart, setTempLineStart] = useState(null); // { time, value }

  // Gemini Analyzer state
  const [userIdea, setUserIdea] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notesHistory, setNotesHistory] = useState([]);
  const [activeHistoricalNote, setActiveHistoricalNote] = useState(null);

  // Trigger Alerts state
  const [alerts, setAlerts] = useState([]);
  const [newAlertIndicator, setNewAlertIndicator] = useState('price');
  const [newAlertOperator, setNewAlertOperator] = useState('>');
  const [newAlertValue, setNewAlertValue] = useState('');

  // ── Chart Engine refs (replaces all individual chart/series refs) ──
  const chartContainerRef = useRef(null);
  const chartStateRef = useRef(null);
  const layoutEngineRef = useRef(null);
  const previewSeriesRef = useRef(null);
  const wsRef = useRef(null);

  // Sync refs to avoid stale closures in canvas subscriptions
  const drawingModeRef = useRef(drawingMode);
  const tempLineStartRef = useRef(tempLineStart);
  const drawingsRef = useRef(drawings);

  useEffect(() => { drawingModeRef.current = drawingMode; }, [drawingMode]);
  useEffect(() => { tempLineStartRef.current = tempLineStart; }, [tempLineStart]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  // Sync drawings and alert parameters on mount/symbol change
  useEffect(() => {
    loadDrawingsAndAlerts();
    loadNotesHistory();
  }, [symbol]);

  const loadDrawingsAndAlerts = async () => {
    try {
      // 1. Fetch Drawings
      const dRes = await fetch(`/api/agent/drawings/${symbol}`);
      const dData = await dRes.json();
      if (dData.status === 'success') {
        // We will plot these once the chart is initialized
        setDrawings(dData.drawings.map(d => ({ ...d, ref: null })));
      }
      
      // 2. Fetch Alerts
      const aRes = await fetch(`/api/agent/alerts?symbol=${symbol}`);
      const aData = await aRes.json();
      if (aData.status === 'success') {
        setAlerts(aData.alerts);
      }
    } catch (err) {
      console.error("Failed to load drawings/alerts database:", err);
    }
  };

  const loadNotesHistory = async () => {
    try {
      const res = await fetch(`/api/agent/notes/${symbol}`);
      const data = await res.json();
      if (data.status === 'success') {
        setNotesHistory(data.notes);
      }
    } catch (err) {
      console.error("Failed to load notes history:", err);
    }
  };

  // ── Chart Engine Initialisation & WebSockets ──────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Create the chart engine from activeIndicators config
    const { chartState, layoutEngine } = createChartEngine(
      chartContainerRef.current,
      DEFAULT_INDICATORS
    );

    chartStateRef.current = chartState;
    layoutEngineRef.current = layoutEngine;

    // Convenience aliases for the drawing tools (they need the price chart + candle series)
    const chart = layoutEngine.priceChart;
    const candleSeries = layoutEngine.candleSeries;

    // 2. Load History & WebSocket
    let historyLoaded = false;
    const pendingTicks = [];

    fetch(`/api/history/${symbol}?interval=${timeframe}`)
      .then(r => r.json())
      .then(hist => {
        if (hist.data?.length > 0) {
          // Feed candles into the state model — this triggers compute() internally
          chartState.setCandles(hist.data);
          layoutEngine.refresh();
          layoutEngine.fitContent();
          
          // Re-draw saved drawings once candles are loaded
          drawSavedDrawings(drawings);
        }
        historyLoaded = true;
        for (const tick of pendingTicks) {
          chartState.appendCandle(tick);
          layoutEngine.refresh();
          addTick(symbol, tick);
        }
        pendingTicks.length = 0;
      })
      .catch(err => {
        console.error("History fetch failed in full view:", err);
        historyLoaded = true;
      });

    // 3. Establish real-time WS connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/stream/${symbol}?interval=${timeframe}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'kline_update') {
          if (!historyLoaded) {
            pendingTicks.push(msg.data);
            return;
          }
          // Feed the tick into ChartState — it appends/morphs the last candle,
          // recomputes all indicators, and the layoutEngine refreshes series data.
          chartState.appendCandle(msg.data);
          layoutEngine.refresh();

          addTick(symbol, msg.data);
        } else if (msg.type === 'score_update') {
          setScore(symbol, msg);
        }
      } catch (err) {}
    };

    // 4. Canvas-level drawing tool subscriptions (same logic as before)
    chart.subscribeClick(async (param) => {
      const mode = drawingModeRef.current;
      if (mode === 'cursor' || !param.point || !param.time) return;

      const time = param.time;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (!price) return;

      if (mode === 'horizontal') {
        try {
          const res = await fetch(`/api/agent/drawings/${symbol}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'horizontal', data: { price } }),
          });
          const rData = await res.json();
          
          if (rData.status === 'success') {
            const priceLine = candleSeries.createPriceLine({
              price: price,
              color: '#3B82F6',
              lineWidth: 2,
              lineStyle: 0,
              title: 'S/R',
              axisLabelVisible: true,
            });
            setDrawings(prev => [
              ...prev,
              { id: rData.id, type: 'horizontal', data: { price }, ref: priceLine },
            ]);
          }
        } catch (err) {
          console.error("Failed to save horizontal drawing line:", err);
        }
      } else if (mode === 'trendline') {
        const startVal = tempLineStartRef.current;
        if (!startVal) {
          // Store first point
          setTempLineStart({ time, value: price });
        } else {
          // Draw final line between first point and this click point
          try {
            const trendData = { start: startVal, end: { time, value: price } };
            const res = await fetch(`/api/agent/drawings/${symbol}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'trendline', data: trendData }),
            });
            const rData = await res.json();

            if (rData.status === 'success') {
              const lineSeries = chart.addLineSeries({
                color: '#C084FC',
                lineWidth: 2,
                lastValueVisible: false,
                priceLineVisible: false,
              });
              const pts = [
                { time: startVal.time, value: startVal.value },
                { time, value: price },
              ];
              pts.sort((a, b) => getTimeValue(a.time) - getTimeValue(b.time));
              lineSeries.setData(pts);
              
              setDrawings(prev => [
                ...prev,
                { id: rData.id, type: 'trendline', data: trendData, ref: lineSeries },
              ]);
            }
          } catch (err) {
            console.error("Failed to save trendline:", err);
          } finally {
            setTempLineStart(null);
            if (previewSeriesRef.current) {
              chart.removeSeries(previewSeriesRef.current);
              previewSeriesRef.current = null;
            }
          }
        }
      } else if (mode === 'eraser') {
        let closest = null;
        let minDiff = Infinity;
        const currentDrawings = drawingsRef.current;

        for (const d of currentDrawings) {
          if (d.type === 'horizontal') {
            const diff = Math.abs(d.data.price - price);
            if (diff < minDiff) {
              minDiff = diff;
              closest = d;
            }
          } else if (d.type === 'trendline') {
            const t1 = getTimeValue(d.data.start.time);
            const t2 = getTimeValue(d.data.end.time);
            const clickT = getTimeValue(time);

            // Check if click is horizontally within segment bounds (with small horizontal padding)
            const minT = Math.min(t1, t2);
            const maxT = Math.max(t1, t2);
            const padding = Math.max((maxT - minT) * 0.05, 3600); // 5% segment width or 1h padding

            if (clickT >= minT - padding && clickT <= maxT + padding) {
              const p1 = d.data.start.value;
              const p2 = d.data.end.value;

              let p_expected;
              if (Math.abs(t2 - t1) < 1) {
                p_expected = p1;
              } else {
                p_expected = p1 + ((p2 - p1) / (t2 - t1)) * (clickT - t1);
              }

              const diff = Math.abs(p_expected - price);
              if (diff < minDiff) {
                minDiff = diff;
                closest = d;
              }
            }
          }
        }

        // Erase within 1% price tolerance for premium precise feel
        if (closest && minDiff / price < 0.01) {
          try {
            const res = await fetch(`/api/agent/drawings/item/${closest.id}`, { method: 'DELETE' });
            if (res.ok) {
              if (closest.type === 'horizontal') {
                candleSeries.removePriceLine(closest.ref);
              } else {
                chart.removeSeries(closest.ref);
              }
              setDrawings(prev => prev.filter(item => item.id !== closest.id));
            }
          } catch (err) {
            console.error("Failed to erase drawing:", err);
          }
        }
      }
    });

    let animationFrameId = null;

    chart.subscribeCrosshairMove((param) => {
      const mode = drawingModeRef.current;
      const startVal = tempLineStartRef.current;
      if (mode !== 'trendline' || !startVal || !param.point || !param.time) return;

      const time = param.time;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (time && price) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          if (!previewSeriesRef.current) {
            previewSeriesRef.current = chart.addLineSeries({
              color: 'rgba(192, 132, 252, 0.4)',
              lineWidth: 1.5,
              lineStyle: 2, // Dotted
              lastValueVisible: false,
              priceLineVisible: false,
              autoscaleInfoProvider: () => null,
            });
          }
          const pts = [
            { time: startVal.time, value: startVal.value },
            { time, value: price },
          ];
          pts.sort((a, b) => getTimeValue(a.time) - getTimeValue(b.time));
          previewSeriesRef.current.setData(pts);
        });
      }
    });

    // 5. Resize handler
    const handleResize = () => {
      if (layoutEngineRef.current) {
        layoutEngineRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    // Trigger initial resize after elements render fully in viewport
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) wsRef.current.close();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (layoutEngineRef.current) {
        layoutEngineRef.current.destroy();
        layoutEngineRef.current = null;
      }
      chartStateRef.current = null;
    };
  }, [symbol, timeframe]);

  // Re-draw drawings helper
  const drawSavedDrawings = (savedList) => {
    const engine = layoutEngineRef.current;
    if (!engine?.priceChart || !engine?.candleSeries) return;
    const chart = engine.priceChart;
    const candleSeries = engine.candleSeries;
    
    const updatedDrawings = [];
    
    // Clear any existing references just in case
    for (const d of drawings) {
      if (d.ref) {
        if (d.type === 'horizontal') candleSeries.removePriceLine(d.ref);
        else chart.removeSeries(d.ref);
      }
    }

    for (const d of savedList) {
      if (d.type === 'horizontal') {
        const priceLine = candleSeries.createPriceLine({
          price: d.data.price,
          color: '#3B82F6',
          lineWidth: 2,
          lineStyle: 0,
          title: 'S/R',
          axisLabelVisible: true,
        });
        updatedDrawings.push({ ...d, ref: priceLine });
      } else if (d.type === 'trendline') {
        const lineSeries = chart.addLineSeries({
          color: '#C084FC',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        const pts = [
          { time: d.data.start.time, value: d.data.start.value },
          { time: d.data.end.time, value: d.data.end.value },
        ];
        pts.sort((a, b) => getTimeValue(a.time) - getTimeValue(b.time));
        lineSeries.setData(pts);
        updatedDrawings.push({ ...d, ref: lineSeries });
      }
    }
    
    setDrawings(updatedDrawings);
  };

  // Draw saved drawings when database sync completes
  useEffect(() => {
    if (layoutEngineRef.current?.priceChart && drawings.length > 0 && drawings[0].ref === null) {
      drawSavedDrawings(drawings);
    }
  }, [drawings]);


  const handleClearAllDrawings = async () => {
    if (window.confirm("Are you sure you want to clear all drawings for this coin?")) {
      try {
        const res = await fetch(`/api/agent/drawings/${symbol}`, { method: 'DELETE' });
        if (res.ok) {
          const engine = layoutEngineRef.current;
          if (engine?.priceChart && engine?.candleSeries) {
            for (const d of drawings) {
              if (d.type === 'horizontal') {
                engine.candleSeries.removePriceLine(d.ref);
              } else {
                engine.priceChart.removeSeries(d.ref);
              }
            }
          }
          setDrawings([]);
          setTempLineStart(null);
        }
      } catch (err) {
        console.error("Failed to clear drawings database:", err);
      }
    }
  };

  // ── Gemini Screenshot Handshake ──────────────────────────────────────
  const handleAnalyzeChart = async () => {
    const engine = layoutEngineRef.current;
    if (!engine?.priceChart) return;
    setIsAnalyzing(true);
    setActiveHistoricalNote(null);
    try {
      // 1. Capture base64 screenshot from Lightweight Charts
      const screenshotBase64 = engine.priceChart.takeScreenshot().toDataURL();
      
      // 2. Dispatch to Python Agent API
      const res = await fetch('/api/agent/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          image: screenshotBase64,
          user_idea: userIdea || "Standard market structure scan.",
          timeframe: timeframe
        })
      });
      
      const data = await res.json();
      if (data.status === 'success') {
        setAiAnalysis(data);
        setUserIdea('');
        // Reload drawings to plot LLM generated lines
        loadDrawingsAndAlerts();
        // Reload note history list
        loadNotesHistory();
      }
    } catch (err) {
      console.error("Failed to run Gemini chart analysis:", err);
      alert("AI Analysis failed. Check if server and API key are configured.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Alert Trigger Actions ──────────────────────────────────────────
  const handleAddAlert = async (e) => {
    e.preventDefault();
    if (!newAlertValue) return;

    try {
      const res = await fetch('/api/agent/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          indicator: newAlertIndicator,
          operator: newAlertOperator,
          value: parseFloat(newAlertValue),
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAlerts(prev => [
          {
            id: data.id,
            symbol,
            indicator: newAlertIndicator,
            operator: newAlertOperator,
            value: parseFloat(newAlertValue),
            is_triggered: 0,
            created_at: new Date().toISOString()
          },
          ...prev
        ]);
        setNewAlertValue('');
      }
    } catch (err) {
      console.error("Failed to save alert:", err);
    }
  };

  const handleDeleteAlert = async (id) => {
    try {
      const res = await fetch(`/api/agent/alerts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete alert:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 opacity-100"
      style={{ background: "rgba(0,0,0,0.85)", padding: isFullscreen ? 0 : "30px" }}
    >
      <div
        className={`relative transition-all duration-300 ease-in-out flex border rounded-lg overflow-hidden ${
          isFullscreen ? "w-full h-full border-0 rounded-none" : "w-[94vw] h-[90vh]"
        }`}
        style={{ background: "#0B0E14", borderColor: "#27272A" }}
      >
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Drawing Toolbar & Interactive Charting Area (EXPANDED) */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0C]">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 h-14 border-b shrink-0 bg-[#0B0E14]" style={{ borderColor: "#1F2330" }}>
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-sm font-semibold tracking-wider text-zinc-100">{symbol}</span>
              <span className="font-mono text-[9px] text-zinc-500 tracking-wider uppercase">BYBIT</span>
            </div>

            {/* Timeframe Selector inside Modal */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {AVAILABLE_INTERVALS.map((tf) => {
                const isActive = timeframe === tf.val;
                return (
                  <button
                    key={tf.val}
                    onClick={() => setTimeframe(tf.val)}
                    className="px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider border transition-colors shrink-0"
                    style={{
                      borderColor: isActive ? "#22C55E" : "#1F2330",
                      color: isActive ? "#22C55E" : "#71717A",
                      background: isActive ? "rgba(34,197,94,0.08)" : "transparent",
                    }}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button 
                className="p-1 hover:bg-zinc-800 transition-colors text-[13px]" 
                style={{ color: "#A1A1AA" }} 
                onClick={() => setIsFullscreen(!isFullscreen)}
                title="Toggle Fullscreen"
              >
                {isFullscreen ? "↙" : "↗"}
              </button>
              <button 
                onClick={onClose} 
                className="p-1 hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white text-[13px]"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Chart Panel — Single dynamic container (CanvasLayoutEngine creates sub-panes inside) */}
          <div
            className="flex-1 relative flex flex-col p-2 gap-2 bg-[#0A0A0C] overflow-hidden h-full cursor-crosshair"
            ref={chartContainerRef}
          />
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Sidebar with Engine, Analyzer, and Alerts Tabs */}
        {/* ========================================================================= */}
        <div className="w-[320px] flex flex-col border-l bg-[#0F121C] shrink-0" style={{ borderColor: "#1F2330" }}>
          
          {/* Tab Selector */}
          <div className="flex border-b" style={{ borderColor: "#1F2330" }}>
            {[
              { id: 'engine', label: '🛡️ Engine' },
              { id: 'notes', label: '🧠 Analyzer' },
              { id: 'alerts', label: '⚡ Alerts' }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors
                  ${activeTab === tab.id ? 'text-emerald-400 bg-[#161B29] border-b-2 border-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin space-y-4">
            {activeTab === 'engine' && (
              <>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#1F2330" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 text-xs">🛡️</span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-100">Analysis Engine</span>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-500">LIVE</span>
                </div>

                {/* Score Ring */}
                <div className="py-2 flex items-center justify-between bg-[#0A0A0C]/20" style={{ borderColor: "#1F2330" }}>
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="#1E1E22" strokeWidth="4" />
                        <circle cx="32" cy="32" r="28" fill="none" 
                          stroke={scoreData?.status === 'PASS' ? "#22C55E" : "#F59E0B"} 
                          strokeWidth="4" 
                          strokeDasharray="175.9" strokeDashoffset={175.9 - (175.9 * (scoreData?.score || 0)) / 100} 
                          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                        />
                      </svg>
                      <span className="absolute font-mono text-lg font-bold text-zinc-100">{scoreData?.score || 0}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold text-zinc-100 uppercase">Confidence</span>
                      <span className="text-[8px] font-mono text-zinc-500 uppercase">{timeframe === '60' ? '1H' : (timeframe === '240' ? '4H' : (timeframe === 'D' ? '1D' : (timeframe === 'W' ? '1W' : `${timeframe}M`)))} Range</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                     <div className="px-2 py-0.5 border text-[9px] font-bold uppercase tracking-wider"
                        style={{ 
                          background: scoreData?.status === 'PASS' ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", 
                          borderColor: scoreData?.status === 'PASS' ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)", 
                          color: scoreData?.status === 'PASS' ? "#22C55E" : "#F59E0B" 
                        }}>
                        {scoreData?.level || "CALCULATING..."}
                     </div>
                     <span className="text-[9px] font-mono font-bold text-zinc-400">{scoreData?.decision || "AWAITING SIGNAL"}</span>
                  </div>
                </div>

                {/* Scorer checklist breakdown */}
                <div className="flex flex-col border border-[#1F2330] rounded overflow-hidden">
                  <div className="px-3 py-2 bg-[#0B0E14] flex items-center justify-between border-b" style={{ borderColor: "#1F2330" }}>
                    <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-zinc-400">Rules Engine Checklist</span>
                    <span className="text-[9px] font-mono text-zinc-600">
                      {scoreData?.rules_payload?.filter(r => r.passed).length || 0}/{scoreData?.rules_payload?.length || 0} passed
                    </span>
                  </div>
                  {scoreData?.rules_payload?.map((rule, idx) => (
                    <div key={idx} className="border-b last:border-b-0" style={{ borderColor: "#1F2330", background: rule.passed ? "rgba(34,197,94,0.02)" : "transparent" }}>
                      <div className="px-3 py-2.5 flex items-center gap-3">
                        <div className="w-5 h-5 flex items-center justify-center shrink-0" 
                          style={{ background: rule.passed ? "rgba(34,197,94,0.1)" : "#101420", border: `1px solid ${rule.passed ? "rgba(34,197,94,0.3)" : "#27272A"}` }}>
                          {rule.passed ? <span className="text-[10px] text-emerald-400">✓</span> : <span className="text-[10px] text-zinc-600">✕</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-[10px] font-mono font-medium block truncate ${rule.passed ? "text-zinc-100" : "text-zinc-500"}`}>
                            {rule.name}
                          </span>
                          <span className="text-[8px] font-mono text-zinc-600 block truncate mt-0.5">
                            {rule.comment}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 border ${rule.passed ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-rose-500 border-rose-500/20 bg-rose-500/5"}`}>
                            {rule.passed ? "PASS" : "FAIL"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!scoreData?.rules_payload && (
                    <div className="text-center py-8 text-zinc-600 font-mono text-[9px] uppercase">Awaiting checklist payload...</div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'notes' && (
              <>
                {/* User Input Idea Block */}
                <div className="flex flex-col gap-2 p-3 border rounded bg-[#161B29]/30" style={{ borderColor: "#1F2330" }}>
                  <label className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest">My Chart Idea / Plan</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Price is testing historical horizontal support around $X. Looking for double bottom confirmation..."
                    value={userIdea}
                    onChange={(e) => setUserIdea(e.target.value)}
                    className="bg-[#0B0E14] border border-[#1F2330] rounded p-2 text-[10px] text-zinc-300 outline-none focus:border-emerald-500/50 resize-none font-sans"
                  />
                  <button
                    onClick={handleAnalyzeChart}
                    disabled={isAnalyzing}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[9px] font-bold text-white uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isAnalyzing ? (
                      <>
                        <span className="animate-spin inline-block w-2.5 h-2.5 border border-white border-t-transparent rounded-full" />
                        Scanning Chart...
                      </>
                    ) : '🤖 Analyze with Gemini'}
                  </button>
                </div>

                {/* AI Review Output Block */}
                {(aiAnalysis || activeHistoricalNote) && (
                  <div className="flex flex-col gap-2.5 p-3.5 border border-emerald-500/20 bg-emerald-500/5 rounded">
                    <div className="flex items-center justify-between border-b border-emerald-500/10 pb-1.5">
                      <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
                        {activeHistoricalNote ? "Saved Note Review" : "Latest AI Scan"}
                      </span>
                      <span className="text-[10px] font-mono font-black text-emerald-400">
                        Score: {activeHistoricalNote ? activeHistoricalNote.strategy_rating : aiAnalysis.strategy_rating}%
                      </span>
                    </div>
                    
                    <div className="space-y-2.5 text-[10px]">
                      <div>
                        <span className="text-zinc-500 font-mono block uppercase text-[8px] tracking-widest">Trend Analysis</span>
                        <p className="text-zinc-200 mt-0.5 leading-relaxed">
                          {activeHistoricalNote ? (activeHistoricalNote.trend_analysis || "Historical trend review") : aiAnalysis.trend_analysis}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500 font-mono block uppercase text-[8px] tracking-widest">Immediate Levels</span>
                        <p className="text-emerald-400 mt-0.5 font-mono">
                          {activeHistoricalNote ? (activeHistoricalNote.support_resistance || "S/R Not logged") : aiAnalysis.support_resistance}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500 font-mono block uppercase text-[8px] tracking-widest">Strategy Notes</span>
                        <p className="text-zinc-300 mt-0.5 whitespace-pre-wrap leading-relaxed font-sans">
                          {activeHistoricalNote ? activeHistoricalNote.agent_feedback : aiAnalysis.strategy_feedback}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes History list */}
                <div className="space-y-2">
                  <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest block pl-1">Saved Scans History</span>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin">
                    {notesHistory.map((note) => (
                      <div 
                        key={note.id} 
                        onClick={() => {
                          setActiveHistoricalNote(note);
                          setAiAnalysis(null);
                        }}
                        className={`p-2.5 border rounded cursor-pointer transition-all flex items-center justify-between
                          ${activeHistoricalNote?.id === note.id ? 'bg-[#161B29] border-emerald-500/50' : 'bg-[#101420]/30 border-[#1F2330] hover:bg-[#161B29]/50'}`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-mono text-zinc-400 block truncate font-medium">"{note.user_idea}"</span>
                          <span className="text-[7.5px] font-mono text-zinc-600 uppercase mt-0.5">{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                        {note.screenshot_path && <span className="text-[8.5px] font-mono text-emerald-500/80">🖼️</span>}
                      </div>
                    ))}
                    {notesHistory.length === 0 && (
                      <div className="text-center py-6 text-zinc-600 font-mono text-[9px] uppercase">No notes logged yet.</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'alerts' && (
              <>
                {/* Create Trigger Alert Form */}
                <form onSubmit={handleAddAlert} className="flex flex-col gap-3 p-3.5 border rounded bg-[#161B29]/30" style={{ borderColor: "#1F2330" }}>
                  <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest">Add Alert Trigger</span>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-mono text-zinc-500 uppercase">Target Indicator</label>
                    <select
                      value={newAlertIndicator}
                      onChange={(e) => setNewAlertIndicator(e.target.value)}
                      className="bg-[#0B0E14] border border-[#1F2330] rounded p-2 text-[10px] text-zinc-300 outline-none cursor-pointer"
                    >
                      <option value="price">Price (USDT)</option>
                      <option value="rsi">RSI (14)</option>
                      <option value="macd">MACD Line</option>
                      <option value="ema55">EMA (55)</option>
                      <option value="ema200">EMA (200)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-mono text-zinc-500 uppercase">Operator</label>
                      <select
                        value={newAlertOperator}
                        onChange={(e) => setNewAlertOperator(e.target.value)}
                        className="bg-[#0B0E14] border border-[#1F2330] rounded p-2 text-[10px] text-zinc-300 outline-none cursor-pointer"
                      >
                        <option value=">">&gt; (Greater Than)</option>
                        <option value="<">&lt; (Less Than)</option>
                        <option value="cross_up">Crosses Above</option>
                        <option value="cross_down">Crosses Below</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-mono text-zinc-500 uppercase">Trigger Value</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 64200 or 30"
                        value={newAlertValue}
                        onChange={(e) => setNewAlertValue(e.target.value)}
                        className="bg-[#0B0E14] border border-[#1F2330] rounded p-2 text-[10px] text-zinc-300 outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!newAlertValue}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[9px] font-bold text-white uppercase tracking-wider transition-colors mt-1"
                  >
                    + Set Alert Trigger
                  </button>
                </form>

                {/* Active Alerts List */}
                <div className="space-y-2">
                  <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest block pl-1">Active Triggers ({alerts.length})</span>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin">
                    {alerts.map((a) => (
                      <div 
                        key={a.id}
                        className="p-2.5 border rounded bg-[#101420]/30 border-[#1F2330] flex items-center justify-between"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-mono font-bold text-zinc-200">
                            {a.indicator.toUpperCase()} {a.operator} {a.value.toLocaleString()}
                          </span>
                          <span className="text-[7.5px] font-mono text-zinc-600 uppercase mt-0.5">Active</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteAlert(a.id)}
                          className="text-rose-500 hover:text-rose-400 text-[10px] font-bold px-1.5 py-0.5 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {alerts.length === 0 && (
                      <div className="text-center py-6 text-zinc-600 font-mono text-[9px] uppercase">No active triggers set.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="px-4 py-2.5 border-t bg-[#0B0E14] flex items-center justify-between mt-auto shrink-0" style={{ borderColor: "#1F2330" }}>
             <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider">Lumina scoring engine</span>
          </div>
        </div>

      </div>
    </div>
  );
}
