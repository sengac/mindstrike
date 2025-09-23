import React from 'react';
import type { ExtractedMetadata } from '../services/metadata-extractor';
import { useImageCache } from '../hooks/useImageCache';
import {
  Music,
  Clock,
  Volume2,
  Disc,
  User,
  Calendar,
  Tag,
  FileText,
} from 'lucide-react';

interface MetadataDisplayProps {
  metadata: ExtractedMetadata;
  compact?: boolean;
  showCoverArt?: boolean;
  showAdvanced?: boolean;
  className?: string;
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({
  metadata,
  compact = false,
  showCoverArt = true,
  showAdvanced = false,
  className = '',
}) => {
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatBitrate = (bitrate: number): string => {
    return `${bitrate} kbps`;
  };

  const formatSampleRate = (sampleRate: number): string => {
    return `${(sampleRate / 1000).toFixed(1)} kHz`;
  };

  const getCoverArtUrl = (): string | null => {
    if (!metadata.coverArt?.length) {
      return null;
    }
    const coverArt = metadata.coverArt[0];
    const base64 = coverArt.data;
    return `data:${coverArt.format};base64,${base64}`;
  };

  // Use image cache for cover art
  const { cachedUrl: cachedCoverArt, isLoading: coverArtLoading } =
    useImageCache(getCoverArtUrl() || undefined);

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {showCoverArt && metadata.coverArt?.length && (
          <div className="w-12 h-12 rounded flex items-center justify-center bg-gray-100">
            {coverArtLoading ? (
              <Music className="w-6 h-6 text-gray-400 animate-pulse" />
            ) : cachedCoverArt ? (
              <img
                src={cachedCoverArt}
                alt="Cover art"
                className="w-12 h-12 rounded object-cover"
              />
            ) : (
              <Music className="w-6 h-6 text-gray-400" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {metadata.title || 'Unknown Title'}
          </div>
          <div className="text-sm text-gray-500 truncate">
            {metadata.artist || 'Unknown Artist'}
            {metadata.album && ` • ${metadata.album}`}
          </div>
        </div>
        {metadata.duration && (
          <div className="text-sm text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(metadata.duration)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      <div className="flex gap-6">
        {/* Cover Art */}
        {showCoverArt && metadata.coverArt?.length && (
          <div className="flex-shrink-0 w-32 h-32 rounded-lg flex items-center justify-center bg-gray-100 shadow-md">
            {coverArtLoading ? (
              <Music className="w-16 h-16 text-gray-400 animate-pulse" />
            ) : cachedCoverArt ? (
              <img
                src={cachedCoverArt}
                alt="Album cover"
                className="w-32 h-32 rounded-lg object-cover shadow-md"
              />
            ) : (
              <Music className="w-16 h-16 text-gray-400" />
            )}
          </div>
        )}

        {/* Main Metadata */}
        <div className="flex-1 space-y-4">
          {/* Title and Basic Info */}
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Music className="w-5 h-5" />
              {metadata.title || 'Unknown Title'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {metadata.artist && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Artist:</span>
                  <span>{metadata.artist}</span>
                </div>
              )}

              {metadata.album && (
                <div className="flex items-center gap-2">
                  <Disc className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Album:</span>
                  <span>{metadata.album}</span>
                </div>
              )}

              {metadata.year && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Year:</span>
                  <span>{metadata.year}</span>
                </div>
              )}

              {metadata.genre?.length && (
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Genre:</span>
                  <span>{metadata.genre.join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Audio Properties */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            {metadata.duration && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="font-medium">Duration</div>
                  <div className="text-gray-500">
                    {formatDuration(metadata.duration)}
                  </div>
                </div>
              </div>
            )}

            {metadata.bitrate && (
              <div className="flex items-center gap-2 text-sm">
                <Volume2 className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="font-medium">Bitrate</div>
                  <div className="text-gray-500">
                    {formatBitrate(metadata.bitrate)}
                  </div>
                </div>
              </div>
            )}

            {metadata.sampleRate && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 bg-gray-400 rounded-full" />
                <div>
                  <div className="font-medium">Sample Rate</div>
                  <div className="text-gray-500">
                    {formatSampleRate(metadata.sampleRate)}
                  </div>
                </div>
              </div>
            )}

            {metadata.channels && (
              <div className="flex items-center gap-2 text-sm">
                <Volume2 className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="font-medium">Channels</div>
                  <div className="text-gray-500">{metadata.channels}</div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Metadata */}
          {showAdvanced && (
            <div className="space-y-4 pt-4 border-t">
              {/* Track/Disc Numbers */}
              {(metadata.track || metadata.disc) && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {metadata.track && (
                    <div>
                      <span className="font-medium">Track:</span>
                      <span className="ml-2">
                        {metadata.track.no}
                        {metadata.track.of && ` of ${metadata.track.of}`}
                      </span>
                    </div>
                  )}
                  {metadata.disc && (
                    <div>
                      <span className="font-medium">Disc:</span>
                      <span className="ml-2">
                        {metadata.disc.no}
                        {metadata.disc.of && ` of ${metadata.disc.of}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Info */}
              {(metadata.albumArtist ||
                metadata.composer?.length ||
                metadata.publisher) && (
                <div className="space-y-2 text-sm">
                  {metadata.albumArtist && (
                    <div>
                      <span className="font-medium">Album Artist:</span>
                      <span className="ml-2">{metadata.albumArtist}</span>
                    </div>
                  )}
                  {metadata.composer?.length && (
                    <div>
                      <span className="font-medium">Composer:</span>
                      <span className="ml-2">
                        {metadata.composer.join(', ')}
                      </span>
                    </div>
                  )}
                  {metadata.publisher && (
                    <div>
                      <span className="font-medium">Publisher:</span>
                      <span className="ml-2">{metadata.publisher}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Format Info */}
              {metadata.format && (
                <div className="space-y-2 text-sm">
                  <div className="font-medium">Format Information:</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 pl-4">
                    {metadata.format.container && (
                      <div>Container: {metadata.format.container}</div>
                    )}
                    {metadata.format.codec && (
                      <div>Codec: {metadata.format.codec}</div>
                    )}
                    {metadata.format.lossless !== undefined && (
                      <div>
                        Lossless: {metadata.format.lossless ? 'Yes' : 'No'}
                      </div>
                    )}
                    {metadata.format.tagTypes?.length && (
                      <div>Tags: {metadata.format.tagTypes.join(', ')}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Comments */}
              {metadata.comment?.length && (
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Comments:
                  </div>
                  <div className="text-gray-600 pl-6 mt-1">
                    {metadata.comment.join(', ')}
                  </div>
                </div>
              )}

              {/* Lyrics */}
              {metadata.lyrics?.length && (
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Lyrics:
                  </div>
                  <div className="text-gray-600 pl-6 mt-1 whitespace-pre-wrap">
                    {metadata.lyrics.join('\n')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
