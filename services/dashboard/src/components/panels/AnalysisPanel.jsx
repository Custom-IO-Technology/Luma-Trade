import React from 'react';

export default function AnalysisPanel({ scoreData }) {
  const score = scoreData?.score || 0;
  const status = scoreData?.status || 'AWAITING';
  
  // Calculate stroke dashoffset for the SVG circle (440 is the circumference)
  const offset = 440 - (440 * score) / 100;

  let badgeClass = '';
  if (status === 'REJECTED') badgeClass = 'text-rose-500 bg-rose-500/10 border border-rose-500/20';
  else if (status === 'FAIL') badgeClass = 'text-zinc-400 bg-zinc-800 border border-zinc-700';
  else badgeClass = 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20';

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-[11px] font-mono tracking-[0.15em] text-zinc-500 uppercase mb-4 w-full text-center">Confidence</h2>
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* SVG Circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="64" cy="64" r="56" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle 
            cx="64" 
            cy="64" 
            r="56" 
            fill="transparent" 
            stroke={score >= 70 ? "#34d399" : (score >= 40 ? "#fbbf24" : "#f43f5e")} 
            strokeWidth="8" 
            strokeDasharray="351.858" 
            strokeDashoffset={351.858 - (351.858 * score) / 100} 
            className="transition-all duration-1000" 
          />
        </svg>
        <div className="absolute text-center">
          <span className="text-3xl font-semibold text-zinc-100">{score}</span>
        </div>
      </div>
      <div className="mt-4 text-center">
        <span className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider ${badgeClass}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
