import { create } from 'zustand';

export const useMarketStore = create((set) => ({
   symbols: {}, // { 'BTCUSDT': { data: [], current: null } }
   timeframe: '60',
   tickVersion: 0,  // primitive counter — forces React re-render on every tick
   setTimeframe: (timeframe) => set({ timeframe }),
  setHistory: (symbol, data) => set((state) => ({
    tickVersion: state.tickVersion + 1,
    symbols: {
      ...state.symbols,
      [symbol]: { ...state.symbols[symbol], data, lastUpdateType: 'history' }
    }
  })),
  addTick: (symbol, tick) => set((state) => {
    console.log(`[marketStore] addTick for ${symbol}: v${state.tickVersion + 1} time=${tick.time} close=${tick.close}`);
    const symbolData = state.symbols[symbol] || { data: [] };
    const newData = [...symbolData.data];
    if (newData.length > 0) {
      const lastTime = newData[newData.length - 1].time;
      if (tick.time === lastTime) {
        newData[newData.length - 1] = tick; // Update current candle
      } else if (tick.time > lastTime) {
        newData.push(tick); // New candle
      } else {
        console.warn(`[marketStore] Ignored out-of-order tick for ${symbol}. tick.time=${tick.time}, lastTime=${lastTime}`);
        return state; // Ignore older out-of-order ticks
      }
    } else {
      newData.push(tick);
    }
    return {
      tickVersion: state.tickVersion + 1,
      symbols: {
        ...state.symbols,
        [symbol]: { data: newData, current: tick, lastUpdateType: 'tick' }
      }
    };
  })
}));
