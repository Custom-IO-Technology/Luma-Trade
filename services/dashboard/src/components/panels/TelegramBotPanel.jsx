import React, { useState, useEffect } from 'react';
import { useBotStore } from '../../stores/botStore';

export default function TelegramBotPanel({ onClose }) {
  const { status, setStatus, isEnabled, setIsEnabled } = useBotStore();
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('tg_bot_token');
    const savedChatId = localStorage.getItem('tg_chat_id');
    if (savedToken) setToken(savedToken);
    if (savedChatId) setChatId(savedChatId);
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, chat_id: chatId }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        localStorage.setItem('tg_bot_token', token);
        localStorage.setItem('tg_chat_id', chatId);
        setStatus('connected');
        onClose();
      }
    } catch (err) {
      console.error("Failed to save settings", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="w-full max-w-sm bg-[#16161A] border border-[#27272A] rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b bg-[#0D0D0F] flex items-center justify-between" style={{ borderColor: "#27272A" }}>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
            <span className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-100">Bot Configuration</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-6 bg-[#0D0D0F]/30">
          {/* Status Toggle - Improved Visibility */}
          <div className="flex items-center justify-between p-4 bg-[#1C1C21]/50 border border-zinc-800/50 rounded-md">
             <div className="flex flex-col">
                <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-widest">Signal Delivery</span>
                <span className={`text-[8px] font-mono uppercase mt-0.5 font-bold ${isEnabled ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {isEnabled ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
                </span>
             </div>
             <button 
               onClick={() => setIsEnabled(!isEnabled)}
               className={`relative w-14 h-7 rounded-full transition-all duration-300 flex items-center px-1 ${isEnabled ? 'bg-emerald-600' : 'bg-zinc-800'}`}
             >
                <div className={`absolute text-[8px] font-bold font-mono transition-all duration-300 ${isEnabled ? 'right-2 text-white/50' : 'left-6 text-zinc-500'}`}>
                  {isEnabled ? 'ON' : 'OFF'}
                </div>
                <div className={`w-5 h-5 rounded-full bg-white shadow-lg transform transition-all duration-300 ${isEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
             </button>
          </div>

          {/* Credentials */}
          <div className="space-y-4">
             <div className="flex flex-col gap-2">
                <label className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest ml-1">Telegram Bot Token</label>
                <input 
                  type="password"
                  placeholder="8770677537:AAEJC9x..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-[#101014] border border-[#27272A] text-zinc-200 text-[11px] font-mono px-3 py-2.5 rounded focus:outline-none focus:border-emerald-500/40 transition-all"
                />
             </div>
             <div className="flex flex-col gap-2">
                <label className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest ml-1">Your Chat ID</label>
                <input 
                  type="text"
                  placeholder="458365183"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  className="bg-[#101014] border border-[#27272A] text-zinc-200 text-[11px] font-mono px-3 py-2.5 rounded focus:outline-none focus:border-emerald-500/40 transition-all"
                />
             </div>
          </div>

          <div className="flex flex-col gap-3 mt-2">
             <button 
               onClick={handleSaveSettings}
               disabled={isSaving || !token || !chatId}
               className="w-full py-3.5 bg-zinc-100 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-black text-[10px] font-mono font-black rounded transition-all uppercase tracking-[0.25em]"
             >
               {isSaving ? 'Syncing...' : 'Save & Initialize'}
             </button>
             <p className="text-[8px] text-zinc-600 font-mono text-center uppercase tracking-wider opacity-50 leading-relaxed px-4">
               Bot commands are managed via Telegram app. Alerts will be sent when System is ONLINE.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
