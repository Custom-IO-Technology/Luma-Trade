import React from 'react';

export default function AppShell({ activeSymbol, setActiveSymbol }) {
  return (
    <div className="h-screen w-full flex bg-[#0B0E14] text-gray-300 overflow-hidden">
      {/* Sidebar (Placeholder) */}
      <div className="w-16 md:w-64 border-r border-white/10 flex-shrink-0 hidden sm:block">
        <div className="p-4 font-bold text-white tracking-widest uppercase border-b border-white/10">
          <span className="hidden md:inline">Obscura</span>
          <span className="md:hidden">OBS</span>
        </div>
        <div className="p-4 space-y-2">
          {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(sym => (
            <button 
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                activeSymbol === sym ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (Placeholder) */}
        <header className="h-16 border-b border-white/10 flex items-center px-6 justify-between flex-shrink-0">
          <h1 className="text-xl font-bold text-white">{activeSymbol} Dashboard</h1>
          <div className="flex gap-4">
            <span className="glass-badge-pass animate-pulse">System Live</span>
          </div>
        </header>

        {/* Content Grid */}
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full max-w-7xl mx-auto">
            
            {/* Left/Middle Column (Chart + Logs) */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* Chart Placeholder */}
              <div className="glass-panel p-4 flex flex-col h-96">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-sm tracking-widest text-gray-400 uppercase">Live Market Data</h2>
                </div>
                <div className="flex-1 bg-black/20 rounded border border-white/5 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <p>TradingView Lightweight Charts</p>
                    <p className="text-xs mt-2">Implementation: src/components/widgets/CoinWidget.jsx</p>
                  </div>
                </div>
              </div>

              {/* Alert Log Placeholder */}
              <div className="glass-panel p-4 flex-1 min-h-[200px]">
                <h2 className="text-sm tracking-widest text-gray-400 uppercase mb-4">Alert Log</h2>
                <div className="text-gray-500 text-sm">
                  Awaiting signals...
                </div>
              </div>
            </div>

            {/* Right Column (Analysis Engine) */}
            <div className="flex flex-col gap-6">
              {/* Score Gauge Placeholder */}
              <div className="glass-panel p-6 flex flex-col items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                <h2 className="text-sm tracking-widest text-gray-400 uppercase mb-4 w-full text-center">Confidence Score</h2>
                <div className="relative w-40 h-40 flex items-center justify-center">
                  {/* SVG Circle Placeholder */}
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                    <circle cx="80" cy="80" r="70" fill="transparent" stroke="#34d399" strokeWidth="10" strokeDasharray="440" strokeDashoffset="110" className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-4xl font-bold text-white">75</span>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <span className="glass-badge-pass">ENTER SCALED SIZE</span>
                </div>
              </div>

              {/* Rules Checklist Placeholder */}
              <div className="glass-panel p-4 flex-1">
                <h2 className="text-sm tracking-widest text-gray-400 uppercase mb-4">Rule Breakdown</h2>
                <div className="space-y-3">
                  {['Bollinger Bands Cross (20)', 'Candle Confirmation (15)', 'EMA Position (15)'].map((rule, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5">
                      <span className="text-sm">{rule}</span>
                      <span className="text-emerald-400">✅</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5">
                    <span className="text-sm text-gray-500">Volume Surge (15)</span>
                    <span className="text-gray-600">❌</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
