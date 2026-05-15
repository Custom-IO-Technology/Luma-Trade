import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useMarketStore } from '../stores/marketStore';
import { useScoreStore } from '../stores/scoreStore';

export const useMarketStream = (symbol, interval = '60') => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${wsProtocol}//${window.location.host}/api/ws/stream/${symbol}?interval=${interval}`;
  const { status, wsRef } = useWebSocket(url);
  const addTick = useMarketStore(state => state.addTick);
  const setScore = useScoreStore(state => state.setScore);

  useEffect(() => {
    if (!wsRef.current) return;

    const ws = wsRef.current;
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`[useMarketStream] Received ${message.type} for ${symbol}`);
        if (message.type === 'kline_update' && message.symbol === symbol) {
          addTick(symbol, message.data);
        } else if (message.type === 'score_update' && message.symbol === symbol) {
          setScore(symbol, message);
        }
      } catch (err) {
        console.error('Error parsing WS message', err);
      }
    };
  }, [status, symbol, addTick, setScore, wsRef]);

  return { status };
};
