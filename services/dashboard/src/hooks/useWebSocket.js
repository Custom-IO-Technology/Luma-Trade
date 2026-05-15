import { useState, useEffect, useRef } from 'react';

export const useWebSocket = (url) => {
  const [status, setStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(1000);

  useEffect(() => {
    const connect = () => {
      setStatus('connecting');
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        setStatus('connected');
        reconnectDelayRef.current = 1000; // Reset delay
      };

      wsRef.current.onclose = () => {
        setStatus('disconnected');
        // Exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
          connect();
        }, reconnectDelayRef.current);
      };

      wsRef.current.onerror = (err) => {
        console.error('WebSocket error:', err);
        wsRef.current.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [url]);

  return { status, wsRef };
};
