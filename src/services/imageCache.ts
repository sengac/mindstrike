/**
 * Frontend image cache service to prevent duplicate downloads of album art
 */
export class ImageCache {
  private readonly cache = new Map<string, Promise<string>>();
  private static instance: ImageCache;

  static getInstance(): ImageCache {
    if (!ImageCache.instance) {
      ImageCache.instance = new ImageCache();
    }
    return ImageCache.instance;
  }

  /**
   * Get image URL, using cache if available
   */
  async getImageUrl(originalUrl: string): Promise<string> {
    if (!originalUrl) {
      return '';
    }

    // If it's already a data URL, use it directly
    if (originalUrl.startsWith('data:')) {
      return originalUrl;
    }

    // Check if we already have a promise for this URL
    if (this.cache.has(originalUrl)) {
      return this.cache.get(originalUrl)!;
    }

    // Create a new promise for this image
    const imagePromise = this.loadImage(originalUrl);
    this.cache.set(originalUrl, imagePromise);

    return imagePromise;
  }

  /**
   * Load image and convert to data URL for caching
   */
  private async loadImage(url: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          // Create canvas to convert image to data URL
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(url); // Fallback to original URL
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Convert to data URL
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve(dataUrl);
        } catch {
          // If canvas conversion fails, log the error and use original URL
          // Failed to convert image to data URL - fallback to original URL
          resolve(url);
        }
      };

      img.onerror = () => {
        // If image fails to load, resolve with empty string
        resolve('');
      };

      img.src = url;
    });
  }

  /**
   * Clear cache for memory management
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Remove specific URL from cache
   */
  removeFromCache(url: string): void {
    this.cache.delete(url);
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const imageCache = ImageCache.getInstance();
