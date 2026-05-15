import React from 'react';

export default function RuleChecklist({ scoreData }) {
  const rules = scoreData?.rules_payload || [];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-[11px] font-mono tracking-[0.15em] text-zinc-500 uppercase mb-4">Rule Breakdown</h2>
      {rules.length === 0 ? (
        <div className="text-[12px] text-zinc-600 font-mono">Awaiting rules evaluation...</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded bg-zinc-900 border border-white/5">
              <span className={`text-[12px] truncate mr-2 ${rule.passed ? 'text-zinc-300' : 'text-zinc-600'}`}>{rule.name}</span>
              <span className="text-[12px] shrink-0">{rule.passed ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
