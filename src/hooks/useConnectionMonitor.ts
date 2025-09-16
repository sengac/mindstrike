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
    let currentAbortController: AbortController | null = null;
    
    const checkConnection = () => {
      // Cancel previous request if still pending
      if (currentAbortController) {
        currentAbortController.abort();
      }
      
      currentAbortController = new AbortController();
      const timeoutId = setTimeout(() => currentAbortController?.abort(), 3000);
      
      fetch('/api/health', { 
        method: 'GET',
        cache: 'no-cache',
        signal: currentAbortController.signal
      })
        .then(response => {
          clearTimeout(timeoutId);
          const connected = response.ok;
          setIsConnected(connected);
          scheduleNextCheck();
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          // Don't set disconnected if the request was just aborted
          if (error.name !== 'AbortError') {
            setIsConnected(false);
          }
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
      // Cancel any pending request
      if (currentAbortController) {
        currentAbortController.abort();
      }
      
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isConnected };
}
