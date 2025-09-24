import { useRef, useCallback, useEffect } from 'react';
import { mindMapApi } from '../services/mindMapApi';
import { sortMindMapsByDate } from '../utils/mindMapUtils';
import { logger } from '../../utils/logger';
import type { MindMap } from './useMindMaps';

interface LoaderOptions {
  onLoad: (mindMaps: MindMap[]) => void;
  onError?: (error: Error) => void;
  autoLoad?: boolean; // Optional auto-load on mount
}

/**
 * Hook that handles loading mind maps from the API
 * Completely decoupled from state management
 */
export function useMindMapLoader({
  onLoad,
  onError,
  autoLoad = false,
}: LoaderOptions) {
  const isLoadingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
  });

  const load = useCallback(async () => {
    if (isLoadingRef.current) return;

    isLoadingRef.current = true;

    try {
      const data = await mindMapApi.fetchAll();
      const sorted = sortMindMapsByDate(data);

      if (hasMountedRef.current) {
        onLoadRef.current(sorted);
      }
    } catch (error) {
      logger.error('Failed to load mindmaps:', error);
      if (hasMountedRef.current && onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, []); // No dependencies - uses refs

  // Mount tracking
  useEffect(() => {
    hasMountedRef.current = true;

    // Only load on mount if autoLoad is true
    if (autoLoad) {
      load().catch(error => {
        logger.error('Initial load failed:', error);
      });
    }

    return () => {
      hasMountedRef.current = false;
    };
  }, [autoLoad, load]);

  return { load };
}
