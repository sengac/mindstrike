import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebugStore } from '../store/useDebugStore';
import { sseEventBus } from '../utils/sseEventBus';
import { logger } from '../utils/logger';
import {
  isSSETokenStatsEvent,
  isSSEContentEvent,
  isSSEStatusEvent,
  isSSEResultEvent,
  isSSEErrorEvent,
} from '../types/sseEvents';

interface GenerationStats {
  tokensPerSecond: number;
  totalTokens: number;
  status: string;
}

interface StreamingOptions {
  onProgress?: (stats: GenerationStats) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
  onWorkflowId?: (workflowId: string | null) => void;
}

export function useGenerationStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [stats, setStats] = useState<GenerationStats>({
    tokensPerSecond: 0,
    totalTokens: 0,
    status: 'Preparing...',
  });

  // Connect to debug store for centralized token tracking
  const { updateTokenStats, setGenerating } = useDebugStore();

  const abortControllerRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const tokenCountRef = useRef<number>(0);
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

  const updateStats = useCallback(
    (newTokens: number, status?: string) => {
      tokenCountRef.current += newTokens;
      const tokensPerSecond = calculateTokensPerSecond();
      const totalTokens = tokenCountRef.current;

      setStats(prevStats => ({
        tokensPerSecond,
        totalTokens,
        status: status || prevStats.status,
      }));

      // Update debug store with current token stats
      updateTokenStats(tokensPerSecond, totalTokens);
    },
    [calculateTokensPerSecond, updateTokenStats]
  );

  const startStreaming = useCallback(
    async (
      url: string,
      requestData: Record<string, unknown>,
      options: StreamingOptions = {}
    ) => {
      if (isStreaming) {
        logger.warn('Already streaming, ignoring new request');
        return;
      }

      setIsStreaming(true);
      setGenerating(true); // Update debug store
      startTimeRef.current = Date.now();
      tokenCountRef.current = 0;

      // Reset stats
      setStats({
        tokensPerSecond: 0,
        totalTokens: 0,
        status: 'Connecting...',
      });

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        // First make the initial request to start generation
        logger.info('Starting generation request:', {
          url,
          ...requestData,
          stream: true,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...requestData,
            stream: true,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error ?? 'Generation failed');
        }

        // Get the stream ID and workflow ID from response
        const result = await response.json();
        logger.info('Generation request response:', result);
        const { streamId, workflowId } = result;

        // Call workflow ID callback if provided
        if (options.onWorkflowId) {
          options.onWorkflowId(workflowId);
        }

        // Subscribe to unified SSE event bus for updates
        logger.info(
          'Subscribing to unified SSE events for streamId:',
          streamId
        );

        updateStats(0, 'Generating...');

        const unsubscribe = sseEventBus.subscribe('*', event => {
          if (event.streamId !== streamId) {
            return;
          }

          try {
            const data = event.data;

            switch (event.type) {
              case 'connected':
                updateStats(0, 'Connected');
                break;

              case 'token':
                // Use server-provided counts if available
                if (isSSETokenStatsEvent(data)) {
                  setStats(() => ({
                    tokensPerSecond: data.tokensPerSecond, // Always use the server value
                    totalTokens: data.totalTokens,
                    status: 'Generating...',
                  }));
                  // Update debug store with server values
                  updateTokenStats(data.tokensPerSecond, data.totalTokens);
                } else {
                  // Fallback to counting individual tokens
                  updateStats(1, 'Generating...');
                }
                break;

              case 'chunk': {
                // For chunk-based updates, estimate tokens
                const contentLength = isSSEContentEvent(data)
                  ? data.content.length
                  : 0;
                const estimatedTokens = Math.max(
                  1,
                  Math.floor(contentLength / 4)
                );
                updateStats(estimatedTokens, 'Generating...');
                break;
              }

              case 'progress':
                updateStats(
                  0,
                  isSSEStatusEvent(data) ? data.status : 'Generating...'
                );
                break;

              case 'complete':
                updateStats(0, 'Completed');
                if (options.onComplete) {
                  const result = isSSEResultEvent(data)
                    ? data.result
                    : undefined;
                  options.onComplete(result);
                }
                unsubscribe();
                stopStreaming();
                break;

              case 'error':
                if (options.onError) {
                  const error = isSSEErrorEvent(data)
                    ? typeof data.error === 'string'
                      ? data.error
                      : data.error.message
                    : 'Unknown error';
                  options.onError(error);
                }
                unsubscribe();
                stopStreaming();
                break;
            }

            // Call progress callback
            if (options.onProgress) {
              options.onProgress(stats);
            }
          } catch (error) {
            logger.error('Error processing SSE event:', error);
          }
        });

        // Set up timeout for the stream
        setTimeout(() => {
          unsubscribe();
          if (options.onError) {
            options.onError('Stream timeout');
          }
          stopStreaming();
        }, 300000); // 5 minute timeout
      } catch (error: unknown) {
        logger.error('Error starting stream:', error);
        if (options.onError) {
          options.onError(
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        stopStreaming();
      }
    },
    [isStreaming, updateStats, calculateTokensPerSecond, stats]
  );

  const stopStreaming = useCallback(() => {
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
    cancelGeneration,
  };
}
