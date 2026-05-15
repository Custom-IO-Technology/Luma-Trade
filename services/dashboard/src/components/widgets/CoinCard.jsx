import React, { useEffect, useRef } from 'react';
import CoinWidget from './CoinWidget';
import { useMarketStore } from '../../stores/marketStore';
import { useScoreStore } from '../../stores/scoreStore';
import { useBotStore } from '../../stores/botStore';

export default function CoinCard({ symbol, onRemove, onExpand }) {
  const scoreData = useScoreStore(state => state.scores[symbol]);
  const symbolData = useMarketStore(state => state.symbols[symbol]);
  const wsStatus = symbolData?.wsStatus || 'connecting';
  const widgetRef = useRef(null);
  const lastAlertTimestamp = useRef(0);
  const isBotEnabled = useBotStore(state => state.isEnabled);

  // Alert Handler: Detect high score and send screenshot
  useEffect(() => {
    if (isBotEnabled && scoreData?.status === 'PASS' && scoreData?.score >= 75) {
      const now = Date.now();
      // Rate limit: 1 alert per 2 minutes per coin in frontend
      if (now - lastAlertTimestamp.current > 120000) {
        lastAlertTimestamp.current = now;
        
        // Short delay to ensure chart has rendered the latest setup
        setTimeout(async () => {
          if (widgetRef.current) {
            const screenshot = widgetRef.current.takeScreenshot();
            if (screenshot) {
              try {
                await fetch('/api/alerts/screenshot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    symbol,
                    image: screenshot,
                    score_data: scoreData
                  })
                });
                console.log(`[Alert] Screenshot sent for ${symbol}`);
              } catch (err) {
                console.error("Failed to send screenshot alert", err);
              }
            }
          }
        }, 1000);
      }
    }
  }, [scoreData, symbol]);

  return (
    <div
      className="group relative border bg-[#16161A] transition-all duration-300"
      style={{
        borderColor: "#27272A",
        borderLeftWidth: 3,
        borderLeftColor: scoreData?.status === 'PASS' ? "#22C55E" : "#71717A",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer border-b"
        style={{ borderColor: "#27272A", background: "#1C1C21" }}
        onClick={() => onExpand(symbol)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col leading-none">
            <span className="font-mono text-[11px] font-bold tracking-wider text-zinc-100">
              {symbol}
            </span>
            <span className="font-mono text-[7px] text-zinc-600 tracking-[0.1em] uppercase mt-0.5">
              BYBIT
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
           {scoreData?.status === 'PASS' ? (
             <div className="inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] uppercase tracking-wider font-medium" style={{ background: "#0D0D0Fcc", borderColor: "#22C55E55", color: "#22C55E" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full dot-blink bg-emerald-500" />
                <span>PASS</span>
             </div>
           ) : (
             <div className="inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] uppercase tracking-wider font-medium" style={{ background: "#0D0D0Fcc", borderColor: "#71717A55", color: "#71717A" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <span>WATCHING</span>
             </div>
           )}
           <button 
             onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}
             className="p-0.5 hover:bg-zinc-800 transition-colors"
             style={{ color: "#52525B" }}
             title="Remove coin"
           >
             ✕
           </button>
        </div>
      </div>
      
      {/* Chart */}
      <div className="relative chart-fade cursor-pointer bg-[#0A0A0C]" onClick={() => onExpand(symbol)}>
        <div style={{ height: 260 }}>
          <CoinWidget symbol={symbol} ref={widgetRef} />
        </div>
      </div>
      
      {/* Info Row: Confidence & Small info */}
      <div className="px-2.5 py-1.5 bg-[#0D0D0F] border-t flex items-center justify-between cursor-pointer" style={{ borderColor: "#27272A" }} onClick={() => onExpand(symbol)}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">
                  {wsStatus}
                </span>
                {symbolData?.current && (
                  <span className="text-[10px] text-emerald-400 font-bold ml-1 font-mono">
                    ${parseFloat(symbolData.current.close).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-baseline gap-1.5">
            {scoreData ? (
              <>
                <span className="text-[10px] font-bold" style={{ color: scoreData.score >= 70 ? "#22C55E" : (scoreData.score >= 40 ? "#F59E0B" : "#EF4444") }}>
                  {scoreData.score}% {scoreData.status}
                </span>
                <span className="text-[8.5px] font-mono text-zinc-600 truncate max-w-[120px]">
                  {scoreData.rules_payload?.filter(r => r.passed).length || 0} / {scoreData.rules_payload?.length || 0} rules passed
                </span>
              </>
            ) : (
              <span className="text-[9px] font-mono text-zinc-500 italic">
                Awaiting evaluation...
              </span>
            )}
          </div>
        </div>
        <span className="font-mono text-[8.5px] text-zinc-700">
          just now
        </span>
      </div>
    </div>
  );
}
