import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import CoinCard from '../widgets/CoinCard';
import ChartFullView from '../widgets/ChartFullView';
import TelegramBotPanel from '../panels/TelegramBotPanel';
import { useScoreStore } from '../../stores/scoreStore';
import { useBotStore } from '../../stores/botStore';
import { useMarketStore } from '../../stores/marketStore';

export default function AppShell() {
  const [coins, setCoins] = useState(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  const [newCoin, setNewCoin] = useState('');
  const [expandedCoin, setExpandedCoin] = useState(null);
  const [isBotPanelOpen, setIsBotPanelOpen] = useState(false);
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const { status: botStatus, isEnabled: isBotEnabled } = useBotStore();
  const { timeframe, setTimeframe } = useMarketStore();
  const scores = useScoreStore(state => state.scores);

  // Sync tracked coins list with database on mount
  useEffect(() => {
    fetch('/api/agent/coins')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.coins) {
          setCoins(data.coins);
        }
      })
      .catch(err => console.error("Error loading coins from database:", err));
  }, []);

  const handleAddCoin = async (e) => {
    e.preventDefault();
    const formatted = newCoin.toUpperCase().trim();
    if (formatted && !coins.includes(formatted)) {
      try {
        const res = await fetch('/api/agent/coins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: formatted }),
        });
        const data = await res.json();
        if (data.status === 'success') {
          setCoins([...coins, formatted]);
          setNewCoin('');
        }
      } catch (err) {
        console.error("Failed to add coin to database:", err);
      }
    }
  };

  const handleRemoveCoin = async (symToRemove) => {
    try {
      const res = await fetch(`/api/agent/coins/${symToRemove}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.status === 'success') {
        setCoins(coins.filter(sym => sym !== symToRemove));
      }
    } catch (err) {
      console.error("Failed to remove coin from database:", err);
    }
  };

  return (
    <div className="App h-screen w-screen flex flex-col bg-[#0D0D0F] text-zinc-100 overflow-hidden font-sans">
      
      {/* Top Bar matching TradingFlow perfectly */}
      <header className="border-b flex items-center justify-between px-6 h-14 shrink-0" style={{ background: "#0D0D0F", borderColor: "#27272A" }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 flex items-center justify-center">
              <div className="absolute inset-0 border-2 rounded-full border-emerald-500" />
              <div className="absolute w-2 h-2 bg-emerald-500 rounded-full" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[13.5px] font-semibold tracking-wider text-zinc-100">OBSCURA</span>
              <span className="font-mono text-[9px] text-zinc-500 tracking-[0.2em] uppercase">Trading Agent</span>
            </div>
          </div>
          
          <div className="h-6 w-px bg-[#27272A]" />

          {/* Premium Timeframe Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Interval</span>
            <div className="relative">
              <button 
                onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                className="flex items-center gap-2 px-3 py-1 border border-zinc-800 bg-[#16161A] hover:bg-zinc-800 hover:border-zinc-700 transition-all rounded-sm group/tf min-w-[60px] justify-between"
              >
                <span className="text-[11px] font-mono font-bold text-zinc-100">
                  {timeframe === '60' ? '1H' : (timeframe === '240' ? '4H' : (timeframe === 'D' ? '1D' : (timeframe === 'W' ? '1W' : `${timeframe}M`)))}
                </span>
                <span className={`text-zinc-600 text-[8px] transition-transform duration-200 ${isTimeframeOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {isTimeframeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsTimeframeOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 w-32 bg-[#1C1C21] border border-zinc-800 shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md bg-opacity-95">
                    {[
                      { val: '30', label: '30M' },
                      { val: '60', label: '1H' },
                      { val: '240', label: '4H' },
                      { val: 'D', label: '1D' },
                      { val: 'W', label: '1W' },
                    ].map((tf) => (
                      <button
                        key={tf.val}
                        onClick={() => {
                          setTimeframe(tf.val);
                          setIsTimeframeOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors flex items-center justify-between group/item
                          ${timeframe === tf.val ? 'bg-zinc-800/50 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}
                      >
                        <span>{tf.label}</span>
                        {timeframe === tf.val && <span className="text-[8px]">●</span>}
                        <div className={`absolute left-0 w-[2px] h-3 bg-emerald-500 transition-opacity ${timeframe === tf.val ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-30'}`} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="h-6 w-px bg-[#27272A]" />

          <div className="inline-flex items-center gap-2 px-2.5 py-1 border text-[11px] font-medium" style={{ borderColor: "#22C55E55", color: "#22C55E", background: "#22C55E10" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full dot-blink bg-emerald-500" />
            <span className="font-mono uppercase tracking-wider">Running</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-[11px] text-zinc-500 mr-2">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600 uppercase tracking-wider text-[10px]">Coins</span>
              <span className="font-mono text-zinc-200 font-semibold">{coins.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600 uppercase tracking-wider text-[10px]">Today</span>
              <span className="font-mono text-zinc-200 font-semibold">{Object.keys(scores).length}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsBotPanelOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 border border-[#27272A] hover:bg-zinc-800/50 transition-all group"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isBotEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
              <span className="text-[10px] font-mono font-bold text-zinc-400 group-hover:text-zinc-100 uppercase tracking-widest">Bot</span>
            </button>
            <button 
              className="p-1.5 border border-[#27272A] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-all"
              title="Global Settings"
            >
              <Settings size={14} />
            </button>
          </div>

          <form onSubmit={handleAddCoin} className="flex items-center gap-2 ml-2">
            <input 
              type="text" 
              placeholder="e.g. SOLUSDT"
              value={newCoin}
              onChange={(e) => setNewCoin(e.target.value)}
              onKeyDown={(e) => { if(e.key === 'Escape') setNewCoin(''); }}
              className="bg-[#16161A] border border-[#27272A] text-zinc-300 text-[11px] font-mono px-2 py-1 rounded-sm w-36 focus:outline-none focus:border-emerald-500/50 uppercase transition-all"
            />
            <button
              type="submit"
              disabled={!newCoin.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-medium hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              style={{ borderColor: "#27272A", color: "#F4F4F5", background: "#16161A" }}
            >
              <span className="font-mono uppercase tracking-wider">+ Add coin</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto scrollbar-thin grid-bg">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[16px] font-semibold text-zinc-100 tracking-tight">Live monitoring</h2>
                <span className="text-[12px] font-mono text-zinc-500">{coins.length} tabs · {coins.length} watching</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> WATCHING
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> SIGNAL
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> NO RULE
                </span>
              </div>
            </div>

            {/* Coin Cards Grid */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
              {coins.map((sym) => (
                <CoinCard key={sym} symbol={sym} onRemove={handleRemoveCoin} onExpand={setExpandedCoin} />
              ))}
              {coins.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-zinc-600">
                  <span className="font-mono text-[14px] mb-2">No coins configured</span>
                  <span className="font-mono text-[11px]">Add a coin to get started</span>
                </div>
              )}
            </div>
            
            <div className="mt-6 pb-2 text-center">
              <span className="text-[11px] font-mono text-zinc-700 uppercase tracking-[0.25em]">
                — end of watchlist —
              </span>
            </div>
          </div>
        </main>

        {/* Right Sidebar - Signal Log mimicking TradingFlow */}
        <aside className="border-l flex flex-col h-full shrink-0 w-[380px]" style={{ background: "#0D0D0F", borderColor: "#27272A" }}>
          <div className="flex items-center justify-between px-4 h-11 border-b shrink-0" style={{ borderColor: "#27272A", background: "#16161A" }}>
            <span className="text-[12px] font-semibold text-zinc-300">Signal Log</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
             {Object.entries(scores).map(([sym, data], idx) => (
                <div key={idx} className="flex gap-3 slide-in-top">
                  <div className="w-8 shrink-0 flex flex-col items-center">
                     <div className="w-8 h-8 rounded border flex items-center justify-center font-mono text-[10px] font-bold" style={{ borderColor: data.status === 'PASS' ? '#22C55E55' : '#27272A', color: data.status === 'PASS' ? '#22C55E' : '#A1A1AA', background: data.status === 'PASS' ? '#22C55E10' : '#16161A' }}>
                       {sym.substring(0,3)}
                     </div>
                  </div>
                  <div className="flex-1 flex flex-col pt-0.5">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <span className="font-mono text-[11px] text-zinc-300">
                        Evaluated {sym}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-mono">
                         {new Date().toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="text-[12px] font-medium leading-tight" style={{ color: data.status === 'PASS' ? '#22C55E' : '#A1A1AA' }}>
                      {data.score}% - {data.status}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-1">
                      {data.rules_payload?.filter(r => r.passed).length || 0} / {data.rules_payload?.length || 0} conditions met
                    </span>
                  </div>
                </div>
              )).reverse().slice(0, 15)}
              {Object.keys(scores).length === 0 && (
                <div className="text-center text-zinc-500 font-mono text-[11px] mt-10">
                  No signals detected.
                </div>
              )}
          </div>
        </aside>
      </div>

      {expandedCoin && (
        <ChartFullView symbol={expandedCoin} onClose={() => setExpandedCoin(null)} />
      )}

      {isBotPanelOpen && (
        <TelegramBotPanel onClose={() => setIsBotPanelOpen(false)} />
      )}
    </div>
  );
}
