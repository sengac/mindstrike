import { useState, useEffect, useRef } from 'react';

export function useConnectionMonitor() {
  const [isConnected, setIsConnected] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    const connect = () => {
      // Clean up existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      eventSourceRef.current = new EventSource('/api/health/stream');

      eventSourceRef.current.onopen = () => {
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      eventSourceRef.current.onerror = () => {
        setIsConnected(false);
        eventSourceRef.current?.close();

        // Keep trying to reconnect while offline
        if (!reconnectTimeoutRef.current) {
          const attemptReconnect = () => {
            // Only reconnect if still disconnected
            if (!isConnectedRef.current) {
              connect();
            }
          };
          reconnectTimeoutRef.current = setTimeout(attemptReconnect, 2000);
        }
      };
    };

    // Initial connection
    connect();

    // Handle browser network events
    const handleOnline = () => {
      connect();
    };

    const handleOffline = () => {
      setIsConnected(false);
      eventSourceRef.current?.close();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isConnected };
}
