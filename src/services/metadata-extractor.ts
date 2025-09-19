// Metadata interface - matches what server provides
export interface ExtractedMetadata {
  // Common metadata
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string[];
  year?: number;
  track?: {
    no?: number;
    of?: number;
  };
  disc?: {
    no?: number;
    of?: number;
  };
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;

  // Advanced metadata
  composer?: string[];
  comment?: string[];
  copyright?: string;
  encodedBy?: string;
  originalDate?: string;
  originalYear?: number;
  publisher?: string;
  label?: string;
  isrc?: string;
  musicbrainz?: {
    artistId?: string;
    albumId?: string;
    trackId?: string;
    releaseGroupId?: string;
  };

  // Audio format info
  format?: {
    container?: string;
    codec?: string;
    codecProfile?: string;
    tagTypes?: string[];
    sampleRate?: number;
    bitsPerSample?: number;
    bitrate?: number;
    numberOfChannels?: number;
    numberOfSamples?: number;
    duration?: number;
    lossless?: boolean;
  };

  // Cover art
  coverArt?: {
    data: string; // base64 encoded from server
    format: string;
    type?: string;
    description?: string;
  }[];

  // Lyrics
  lyrics?: string[];

  // Raw metadata (for debugging/advanced use)
  raw?: {
    common: {
      title?: string;
      artist?: string;
      album?: string;
      genre?: string[];
      year?: number;
      [key: string]: unknown;
    };
    format: {
      duration?: number;
      bitrate?: number;
      sampleRate?: number;
      numberOfChannels?: number;
      [key: string]: unknown;
    };
  };
}

export class MetadataExtractor {
  /**
   * Get a summary of the most important metadata
   */
  getSummary(metadata: ExtractedMetadata): string {
    const parts: string[] = [];

    if (metadata.title) parts.push(`Title: ${metadata.title}`);
    if (metadata.artist) parts.push(`Artist: ${metadata.artist}`);
    if (metadata.album) parts.push(`Album: ${metadata.album}`);
    if (metadata.year) parts.push(`Year: ${metadata.year}`);
    if (metadata.genre?.length)
      parts.push(`Genre: ${metadata.genre.join(', ')}`);
    if (metadata.duration)
      parts.push(`Duration: ${this.formatDuration(metadata.duration)}`);
    if (metadata.bitrate) parts.push(`Bitrate: ${metadata.bitrate} kbps`);
    if (metadata.format?.codec) parts.push(`Codec: ${metadata.format.codec}`);

    return parts.join(' • ');
  }

  /**
   * Format duration in seconds to MM:SS format
   */
  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Check if the metadata contains cover art
   */
  hasCoverArt(metadata: ExtractedMetadata): boolean {
    return Boolean(metadata.coverArt?.length);
  }

  /**
   * Get the primary cover art as a data URL
   */
  getCoverArtDataUrl(metadata: ExtractedMetadata): string | null {
    if (!metadata.coverArt?.length) return null;

    const coverArt = metadata.coverArt[0];
    // Cover art data is already base64 encoded from server
    return `data:${coverArt.format};base64,${coverArt.data}`;
  }
}

// Export a singleton instance
export const metadataExtractor = new MetadataExtractor();
