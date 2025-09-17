import { useState, useEffect } from 'react';
import { sseEventBus } from '../utils/sseEventBus';

export function useConnectionMonitor() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // Subscribe to SSE event bus connection status
    const unsubscribe = sseEventBus.subscribeToConnectionStatus((connected: boolean) => {
      setIsConnected(connected);
    });

    // Also handle browser network events
    const handleOffline = () => {
      setIsConnected(false);
    };

    const handleOnline = () => {
      // Don't immediately set to true - let the SSE connection status determine this
      // The event bus will handle reconnection
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isConnected };
}
