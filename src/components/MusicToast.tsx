import React from 'react';
import { Music } from 'lucide-react';

interface MusicToastProps {
  title: string;
  artist: string;
}

export const MusicToast: React.FC<MusicToastProps> = ({ title, artist }) => {
  return (
    <div className="flex items-center space-x-3 min-w-0">
      {/* Music Thumbnail/Icon */}
      <div className="shrink-0 w-12 h-12 bg-linear-to-br from-blue-500/30 to-purple-500/30 rounded border border-blue-500/40 flex items-center justify-center">
        <Music size={20} className="text-blue-400" />
      </div>

      {/* Track Info */}
      <div className="min-w-0 flex-1">
        <div className="text-white font-medium text-sm truncate">{title}</div>
        <div className="text-gray-300 text-xs truncate">{artist}</div>
      </div>
    </div>
  );
};
