import { useImageCache } from '../hooks/useImageCache';
import { Music } from 'lucide-react';

interface CachedAlbumArtProps {
  imageUrl?: string;
  alt?: string;
  className?: string;
  fallbackIcon?: boolean;
}

export function CachedAlbumArt({
  imageUrl,
  alt = 'Album art',
  className = '',
  fallbackIcon = true,
}: CachedAlbumArtProps) {
  const { cachedUrl, isLoading, error } = useImageCache(imageUrl);

  if (isLoading) {
    return (
      <div
        className={`bg-gray-700 flex items-center justify-center ${className}`}
      >
        <div className="animate-pulse">
          <Music size={16} className="text-gray-500" />
        </div>
      </div>
    );
  }

  if (error || !cachedUrl) {
    return fallbackIcon ? (
      <div
        className={`bg-gray-700 flex items-center justify-center ${className}`}
      >
        <Music size={16} className="text-gray-500" />
      </div>
    ) : (
      <div className={`bg-gray-700 ${className}`} />
    );
  }

  return (
    <img src={cachedUrl} alt={alt} className={`object-cover ${className}`} />
  );
}
