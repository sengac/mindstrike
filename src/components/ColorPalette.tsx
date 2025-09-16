import React from 'react';
import { Palette, X } from 'lucide-react';

interface ColorPaletteProps {
  selectedNodeId: string | null;
  onColorChange: (colors: {
    backgroundClass: string;
    foregroundClass: string;
  }) => void;
  onColorClear: () => void;
}

const COLOR_PRESETS = [
  {
    backgroundClass: 'bg-blue-500 border-blue-400',
    foregroundClass: 'text-white',
    name: 'Blue',
    displayColor: '#3b82f6',
  },
  {
    backgroundClass: 'bg-green-500 border-green-400',
    foregroundClass: 'text-white',
    name: 'Green',
    displayColor: '#10b981',
  },
  {
    backgroundClass: 'bg-purple-500 border-purple-400',
    foregroundClass: 'text-white',
    name: 'Purple',
    displayColor: '#8b5cf6',
  },
  {
    backgroundClass: 'bg-orange-500 border-orange-400',
    foregroundClass: 'text-white',
    name: 'Orange',
    displayColor: '#f59e0b',
  },
  {
    backgroundClass: 'bg-pink-500 border-pink-400',
    foregroundClass: 'text-white',
    name: 'Pink',
    displayColor: '#ec4899',
  },
  {
    backgroundClass: 'bg-red-500 border-red-400',
    foregroundClass: 'text-white',
    name: 'Red',
    displayColor: '#ef4444',
  },
  {
    backgroundClass: 'bg-cyan-500 border-cyan-400',
    foregroundClass: 'text-white',
    name: 'Cyan',
    displayColor: '#06b6d4',
  },
  {
    backgroundClass: 'bg-lime-500 border-lime-400',
    foregroundClass: 'text-white',
    name: 'Lime',
    displayColor: '#84cc16',
  },
];

export function ColorPalette({
  selectedNodeId,
  onColorChange,
  onColorClear,
}: ColorPaletteProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close when node selection changes
  React.useEffect(() => {
    setIsOpen(false);
  }, [selectedNodeId]);

  return (
    <div ref={containerRef} className="relative" data-color-palette>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 text-gray-300"
        title="Node Colors"
      >
        <Palette size={14} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 right-0 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 min-w-[200px] z-[9999]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-300">Node Colors</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-200"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {COLOR_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => {
                  onColorChange({
                    backgroundClass: preset.backgroundClass,
                    foregroundClass: preset.foregroundClass,
                  });
                  setIsOpen(false);
                }}
                className="w-8 h-8 rounded border-2 border-gray-600 hover:border-gray-400 transition-all hover:scale-110"
                style={{ backgroundColor: preset.displayColor }}
                title={preset.name}
              />
            ))}
          </div>

          <button
            onClick={() => {
              onColorClear();
              setIsOpen(false);
            }}
            className="w-full text-left px-2 py-1 text-sm text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2"
          >
            <X size={12} />
            Clear Custom Color
          </button>
        </div>
      )}
    </div>
  );
}
