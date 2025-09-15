import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebugStore } from '../store/useDebugStore';

interface GenerationStats {
  tokensPerSecond: number;
  totalTokens: number;
  status: string;
}

interface StreamingOptions {
  onProgress?: (stats: GenerationStats) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  onWorkflowId?: (workflowId: string | null) => void;
}

export function useGenerationStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [stats, setStats] = useState<GenerationStats>({
    tokensPerSecond: 0,
    totalTokens: 0,
    status: 'Preparing...'
  });
  
  // Connect to debug store for centralized token tracking
  const { updateTokenStats, setGenerating } = useDebugStore();
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const tokenCountRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateTokensPerSecond = useCallback(() => {
    const now = Date.now();
    const timeElapsed = (now - startTimeRef.current) / 1000; // in seconds
    
    if (timeElapsed > 0) {
      const tokensPerSecond = tokenCountRef.current / timeElapsed;
      return tokensPerSecond;
    }
    return 0;
  }, []);

  const updateStats = useCallback((newTokens: number, status?: string) => {
    tokenCountRef.current += newTokens;
    const tokensPerSecond = calculateTokensPerSecond();
    const totalTokens = tokenCountRef.current;
    
    setStats(prevStats => ({
      tokensPerSecond,
      totalTokens,
      status: status || prevStats.status
    }));
    
    // Update debug store with current token stats
    updateTokenStats(tokensPerSecond, totalTokens);
  }, [calculateTokensPerSecond, updateTokenStats]);

  const startStreaming = useCallback(async (
    url: string, 
    requestData: any, 
    options: StreamingOptions = {}
  ) => {
    if (isStreaming) {
      console.warn('Already streaming, ignoring new request');
      return;
    }

    setIsStreaming(true);
    setGenerating(true); // Update debug store
    startTimeRef.current = Date.now();
    tokenCountRef.current = 0;
    lastUpdateTimeRef.current = Date.now();
    
    // Reset stats
    setStats({
      tokensPerSecond: 0,
      totalTokens: 0,
      status: 'Connecting...'
    });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      // First make the initial request to start generation
      console.log('Starting generation request:', url, { ...requestData, stream: true });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...requestData,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      // Get the stream ID and workflow ID from response
      const result = await response.json();
      console.log('Generation request response:', result);
      const { streamId, workflowId } = result;
      
      // Call workflow ID callback if provided
      if (options.onWorkflowId) {
        options.onWorkflowId(workflowId);
      }
      
      // Connect to SSE endpoint for real-time updates
      const sseUrl = `/api/generate/stream/${streamId}`;
      console.log('Connecting to SSE:', sseUrl);
      eventSourceRef.current = new EventSource(sseUrl);
      
      updateStats(0, 'Generating...');

      // Note: We no longer need a continuous interval since server provides stable values

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          
          switch (data.type) {
            case 'connected':
              updateStats(0, 'Connected');
              break;
              
            case 'token':
              // Use server-provided counts if available
              if (data.totalTokens !== undefined && data.tokensPerSecond !== undefined) {
                setStats(() => ({
                  tokensPerSecond: data.tokensPerSecond, // Always use the server value
                  totalTokens: data.totalTokens,
                  status: 'Generating...'
                }));
                // Update debug store with server values
                updateTokenStats(data.tokensPerSecond, data.totalTokens);
              } else {
                // Fallback to counting individual tokens
                updateStats(1, 'Generating...');
              }
              break;
              
            case 'chunk':
              // For chunk-based updates, estimate tokens
              const estimatedTokens = Math.max(1, Math.floor(data.content.length / 4));
              updateStats(estimatedTokens, 'Generating...');
              break;
              
            case 'progress':
              updateStats(0, data.status || 'Generating...');
              break;
              
            case 'complete':
              updateStats(0, 'Completed');
              if (options.onComplete) {
                options.onComplete(data.result);
              }
              stopStreaming();
              break;
              
            case 'error':
              if (options.onError) {
                options.onError(data.error);
              }
              stopStreaming();
              break;
          }
          
          // Call progress callback
          if (options.onProgress) {
            options.onProgress(stats);
          }
          
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSourceRef.current.onerror = (error) => {
        console.error('SSE connection error:', error);
        console.error('SSE readyState:', eventSourceRef.current?.readyState);
        if (options.onError) {
          options.onError('Connection error occurred');
        }
        stopStreaming();
      };

      eventSourceRef.current.onopen = () => {
        console.log('SSE connection opened successfully');
      };

    } catch (error: any) {
      console.error('Error starting stream:', error);
      if (options.onError) {
        options.onError(error.message);
      }
      stopStreaming();
    }
  }, [isStreaming, updateStats, calculateTokensPerSecond, stats]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsStreaming(false);
    setGenerating(false); // Update debug store
  }, [setGenerating]);

  const cancelGeneration = useCallback(() => {
    stopStreaming();
    // Additional cleanup or cancel requests can be added here
  }, [stopStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  return {
    isStreaming,
    stats,
    startStreaming,
    stopStreaming,
    cancelGeneration
  };
}
