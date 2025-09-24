import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook that provides a debounced save function
 * @param saveFn - The save function to debounce
 * @param delay - Debounce delay in milliseconds (default: 500ms)
 * @returns Debounced save function
 */
export function useDebouncedSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay: number = 500
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const saveFnRef = useRef(saveFn);

  // Keep ref updated
  useEffect(() => {
    saveFnRef.current = saveFn;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const save = useCallback(
    async (data: T, immediate = false) => {
      // If immediate save is requested, bypass debouncing
      if (immediate) {
        await saveFnRef.current(data);
        return;
      }

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set up new debounced save
      timeoutRef.current = setTimeout(() => {
        // Only save if component is still mounted
        if (mountedRef.current) {
          saveFnRef.current(data);
        }
      }, delay);
    },
    [delay] // Only depend on delay, not saveFn
  );

  return save;
}
