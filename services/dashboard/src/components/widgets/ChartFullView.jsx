import React, { useState, useEffect } from 'react';
import CoinWidget from './CoinWidget';
import { useScoreStore } from '../../stores/scoreStore';
import { useMarketStore } from '../../stores/marketStore';

const AVAILABLE_STUDIES = [
  { id: "EMA-1", label: "EMA 55" },
  { id: "EMA-2", label: "EMA 200" },
  { id: "RSI", label: "RSI" },
  { id: "MACD", label: "MACD" },
  { id: "STOCH", label: "STOCHASTIC" },
  { id: "STOCHRSI", label: "STOCH RSI" },
  { id: "BB", label: "BOLLINGER" },
  { id: "VWMA", label: "VWMA" },
  { id: "VOL", label: "VOLUME" },
  { id: "ATR", label: "ATR" },
];

const CAT_COLORS = {
  entry:      { dot: "#60A5FA", bg: "#3B82F610", border: "#3B82F630" },
  momentum:   { dot: "#C084FC", bg: "#A855F710", border: "#A855F730" },
  trend:      { dot: "#4ADE80", bg: "#22C55E10", border: "#22C55E30" },
  volatility: { dot: "#FBBF24", bg: "#F59E0B10", border: "#F59E0B30" },
};

const RULE_CONFIG_MAP = {
  "BB cross EMA 55 VWMA": ["emaFast", "bbPeriod", "bbStdDev"],
  "Candle 2 confirms": ["emaFast"],
  "Volume above average": ["volAvgPeriod", "thresholdMultiplier"],
  "MACD K above D": ["macdFast", "macdSlow", "macdSignal"],
  "Stoch RSI K above D": ["stochPeriod", "kPeriod", "dPeriod"],
  "Price above EMA 200 VWMA": ["emaTrend", "vwmaPeriod"],
  "EMA 55 above EMA 200": ["emaFast", "emaTrend"],
  "ATR healthy": ["atrPeriod", "multiplier"],
};

const DEFAULT_PARAMS = {
  emaFast: 55, bbPeriod: 5, bbStdDev: 3,
  rsiPeriod: 14, upperBound: 70, lowerBound: 30,
  emaShort: 20, emaLong: 50,
  macdFast: 12, macdSlow: 26, macdSignal: 9,
  volAvgPeriod: 20, thresholdMultiplier: 2,
  emaTrend: 200, vwmaPeriod: 20,
  stochPeriod: 14, kPeriod: 3, dPeriod: 3,
  atrPeriod: 14, multiplier: 1.5
};

export default function ChartFullView({ symbol, onClose }) {
  const scoreData = useScoreStore(state => state.scores[symbol]);
  const { timeframe, setTimeframe } = useMarketStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStudies, setActiveStudies] = useState(["EMA-1", "EMA-2", "VWMA"]);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [alertThreshold, setAlertThreshold] = useState(75);
  const [editingId, setEditingId] = useState(null);
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, isFullscreen]);

  if (!symbol) return null;

  const toggleStudy = (id) => {
    setActiveStudies(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const updateParam = (key, val) => {
    setParams(prev => ({ ...prev, [key]: val }));
  };

  // Group rules by category
  const rules = scoreData?.rules_payload || [];
  const categorizedRules = {
    entry: rules.slice(0, 2),
    momentum: rules.slice(2, 5),
    trend: rules.slice(5, 7),
    volatility: rules.slice(7, 8),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 opacity-100 pointer-events-auto"
      style={{ background: isFullscreen ? "#0D0D0F" : "rgba(0,0,0,0.85)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isFullscreen) onClose();
      }}
    >
      <div
        className={`relative transition-all duration-300 ease-in-out flex ${
          isFullscreen ? "w-full h-full mx-0 border-0" : "border"
        }`}
        style={{
          width: isFullscreen ? "100vw" : "85vw",
          height: isFullscreen ? "100vh" : "85vh",
          background: "#0D0D0F",
          borderColor: "#27272A",
        }}
      >
        {/* LEFT: Chart panel */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 bg-[#0D0D0F]" style={{ borderColor: "#27272A" }}>
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-[13px] font-semibold tracking-wider text-zinc-100">{symbol}</span>
              <span className="font-mono text-[10px] text-zinc-500 tracking-wider uppercase">BYBIT</span>
            </div>

            <div className="flex-1 flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar mx-4">
              {AVAILABLE_STUDIES.map((s) => {
                const isActive = activeStudies.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleStudy(s.id)}
                    className="inline-flex items-center px-2 py-1 text-[9px] font-mono uppercase tracking-wider border transition-colors shrink-0"
                    style={{
                      borderColor: isActive ? "#22C55E" : "#27272A",
                      color: isActive ? "#22C55E" : "#71717A",
                      background: isActive ? "rgba(34,197,94,0.08)" : "transparent",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button className="p-1 hover:bg-zinc-800 transition-colors" style={{ color: "#A1A1AA" }} onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? "↙" : "↗"}
              </button>
              <button onClick={onClose} className="p-1 hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white">✕</button>
            </div>
          </div>

          <div className="flex-1 relative bg-[#0A0A0C]">
             <div className="absolute inset-4">
                <CoinWidget symbol={symbol} />
             </div>
          </div>
        </div>

        {/* RIGHT: Analysis Engine */}
        {!isFullscreen && (
          <div className="w-[420px] flex flex-col border-l bg-[#16161A] shrink-0" style={{ borderColor: "#27272A" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between bg-[#0D0D0F]" style={{ borderColor: "#27272A" }}>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500 text-xs">🛡️</span>
                <span className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-100">Analysis Engine</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-emerald-500">LIVE</span>
                <button className="text-zinc-500 hover:text-zinc-300 text-xs">↻</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-0">
              {/* Top Score Ring Section */}
              <div className="px-4 py-4 border-b flex items-center justify-between bg-[#0A0A0C]/30" style={{ borderColor: "#27272A" }}>
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

              {/* Alert Controls Section */}
              <div className="px-4 py-4 border-b bg-[#0A0A0C]/50" style={{ borderColor: "#27272A" }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500 text-xs">⚡</span>
                    <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider">Process Status</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-mono font-bold uppercase ${alertEnabled ? "text-emerald-500" : "text-zinc-600"}`}>
                      {alertEnabled ? "Active" : "Disabled"}
                    </span>
                    <button 
                      onClick={() => setAlertEnabled(!alertEnabled)}
                      className={`w-7 h-4 rounded-full relative transition-colors ${alertEnabled ? "bg-emerald-500" : "bg-zinc-700"}`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${alertEnabled ? "left-3.5" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🔔</span>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase">Trigger</span>
                        <span className="text-[11px] font-mono font-bold text-emerald-500">{alertThreshold}%</span>
                      </div>
                      <div className="w-px h-3 bg-zinc-800" />
                       <div className="flex items-center gap-1.5">
                         <span className="text-xs">⏱️</span>
                         <select 
                           value={timeframe} 
                           onChange={(e) => setTimeframe(e.target.value)}
                           className="bg-transparent text-[10px] font-mono font-bold text-zinc-300 outline-none border-none cursor-pointer"
                         >
                           <option value="5">5M</option>
                           <option value="15">15M</option>
                           <option value="30">30M</option>
                           <option value="60">1H</option>
                           <option value="240">4H</option>
                           <option value="D">1D</option>
                           <option value="W">1W</option>
                         </select>
                      </div>
                   </div>
                   <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-widest">Setup Range</span>
                </div>
                <input 
                  type="range" min="30" max="100" step="5" 
                  value={alertThreshold} 
                  onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                  className="w-full h-1 appearance-none bg-zinc-800 rounded-full outline-none accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Categorized Rules List */}
              <div className="flex flex-col">
                {Object.entries(categorizedRules).map(([cat, rules]) => {
                  const colors = CAT_COLORS[cat] || CAT_COLORS.entry;
                  return (
                    <div key={cat} className="flex flex-col">
                      <div className="px-4 py-1.5 bg-[#0A0A0C] flex items-center justify-between">
                        <span className="text-[9px] font-mono uppercase tracking-widest font-bold" style={{ color: colors.dot }}>{cat}</span>
                        <span className="text-[9px] font-mono text-zinc-600">{rules.filter(r => r.passed).length}/{rules.length}</span>
                      </div>
                      {rules.map((rule, idx) => {
                        const configKeys = RULE_CONFIG_MAP[rule.name] || [];
                        const currentValuesStr = configKeys.map(k => `${k}: ${params[k]}`).join(' | ');
                        
                        return (
                          <div key={idx} className="border-b group" style={{ borderColor: "#1A1A1E", background: rule.passed ? colors.bg : "transparent" }}>
                            <div 
                              className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-white/5"
                              onClick={() => setEditingId(editingId === rule.name ? null : rule.name)}
                            >
                              <div className="w-5 h-5 flex items-center justify-center shrink-0" 
                                style={{ background: rule.passed ? `${colors.dot}20` : "#141417", border: `1px solid ${rule.passed ? colors.dot + "40" : "#27272A"}` }}>
                                {rule.passed ? <span className="text-[10px]" style={{ color: colors.dot }}>✓</span> : <span className="text-[10px] text-zinc-600">✕</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-mono font-medium ${rule.passed ? "text-zinc-100" : "text-zinc-600"}`}>{rule.name}</span>
                                    {configKeys.length > 0 && <span className="text-[10px] text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity">⚙️</span>}
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono font-semibold" style={{ color: rule.passed ? colors.dot : "#3F3F46" }}>+{rule.points_awarded || 0}</span>
                                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 border ${rule.passed ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" : "text-rose-500 border-rose-500/30 bg-rose-500/10"}`}>
                                  {rule.passed ? "PASS" : "FAIL"}
                                </span>
                              </div>
                            </div>

                            {/* Input Settings (Expanded) */}
                            {editingId === rule.name && configKeys.length > 0 && (
                              <div className="px-4 pb-3 flex flex-wrap gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                 {configKeys.map(key => (
                                   <div key={key} className="flex flex-col gap-1">
                                      <span className="text-[7px] font-mono text-zinc-600 uppercase">{key.replace(/([A-Z])/g, " $1")}</span>
                                      <input 
                                        type="number" 
                                        value={params[key]} 
                                        onChange={(e) => updateParam(key, parseInt(e.target.value))}
                                        className="w-16 bg-[#0D0D0F] border border-zinc-800 text-[9px] font-mono text-zinc-300 px-1 py-0.5 outline-none focus:border-emerald-500/50" 
                                      />
                                   </div>
                                 ))}
                                 <button onClick={() => setEditingId(null)} className="self-end p-1 text-emerald-500 hover:text-emerald-400">💾</button>
                              </div>
                            )}
                            
                            <div className="px-4 pb-2 pl-12 flex flex-col gap-0.5 pointer-events-none">
                               <span className="text-[9px] font-mono text-zinc-400 block truncate">
                                 {rule.value || currentValuesStr || "Dynamic check"}
                               </span>
                               <span className="text-[8px] font-mono text-zinc-600 italic block truncate">
                                 {rule.detail || "Confirmed trend alignment"}
                               </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-4 py-2 border-t bg-[#0D0D0F] flex items-center justify-between" style={{ borderColor: "#27272A" }}>
               <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[9px] font-mono text-zinc-500 uppercase">{scoreData?.score || 0}% CONFIDENCE MET</span>
               </div>
               <span className="text-[8px] font-mono text-zinc-700 uppercase tracking-widest">Live Engine</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
