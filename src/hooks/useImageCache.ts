import { useState, useEffect } from 'react';
import { imageCache } from '../services/image-cache';

/**
 * Hook for using cached images
 */
export function useImageCache(imageUrl: string | undefined): {
  cachedUrl: string;
  isLoading: boolean;
  error: boolean;
} {
  const [cachedUrl, setCachedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!imageUrl) {
      setCachedUrl('');
      setIsLoading(false);
      setError(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(false);

    imageCache
      .getImageUrl(imageUrl)
      .then(url => {
        if (!isCancelled) {
          setCachedUrl(url);
          setError(!url);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCachedUrl('');
          setError(true);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [imageUrl]);

  return { cachedUrl, isLoading, error };
}
