import { useState, useEffect, useRef } from 'react';

export function useConnectionMonitor() {
  const [isConnected, setIsConnected] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout>();
  const isConnectedRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    const checkConnection = () => {
      fetch('/api/health', { 
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(3000)
      })
        .then(response => {
          const connected = response.ok;
          setIsConnected(connected);
          scheduleNextCheck();
        })
        .catch(() => {
          setIsConnected(false);
          scheduleNextCheck();
        });
    };

    const scheduleNextCheck = () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      const delay = isConnectedRef.current ? 3000 : 1000;
      intervalRef.current = setTimeout(checkConnection, delay);
    };

    // Initial check
    checkConnection();

    // Handle network events
    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isConnected };
}
