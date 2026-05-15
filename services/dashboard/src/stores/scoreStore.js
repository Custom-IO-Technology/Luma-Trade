import { create } from 'zustand';

export const useScoreStore = create((set) => ({
  scores: {}, // { 'BTCUSDT': { score: 0, status: '', rules_payload: [] } }
  setScore: (symbol, scoreData) => set((state) => ({
    scores: {
      ...state.scores,
      [symbol]: scoreData
    }
  }))
}));
