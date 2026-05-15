import { create } from 'zustand';

export const useBotStore = create((set) => ({
  messages: [
    { id: 1, role: 'system', content: 'Bot initialized. Awaiting credentials.', timestamp: new Date().toLocaleTimeString() },
    { id: 2, role: 'bot', content: 'Ready to send signals. Please connect to Telegram.', timestamp: new Date().toLocaleTimeString() },
  ],
  status: 'disconnected',
  isEnabled: localStorage.getItem('obscura_bot_enabled') !== 'false',
  addMessage: (content, role = 'bot') => set((state) => ({
    messages: [...state.messages, { id: Date.now(), role, content, timestamp: new Date().toLocaleTimeString() }]
  })),
  setStatus: (status) => set({ status }),
  setIsEnabled: async (isEnabled) => {
    localStorage.setItem('obscura_bot_enabled', isEnabled);
    set({ isEnabled });
    try {
      await fetch('/api/settings/bot-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: isEnabled })
      });
    } catch (err) {
      console.error("Failed to sync bot status with backend", err);
    }
  },
}));
