import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface GeneratingBlockerProps {
  isVisible: boolean;
  onCancel: () => void;
  status?: string;
  tokensPerSecond?: number;
  totalTokens?: number;
}

export function GeneratingBlocker({
  isVisible,
  onCancel,
  status = 'Generating...',
  tokensPerSecond = 0,
  totalTokens = 0
}: GeneratingBlockerProps) {
  const [dots, setDots] = useState('');

  // Animate the dots
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <h2 className="text-xl font-semibold text-white">Generating Content</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white"
            title="Cancel Generation"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status */}
        <div className="mb-6">
          <p className="text-gray-300 text-lg font-medium">
            {status}{dots}
          </p>
        </div>



        {/* Stats */}
        <div className="space-y-3">
          {/* Tokens per second */}
          <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
            <span className="text-gray-300 font-medium">Generation Speed</span>
            <div className="text-right">
              <span className="text-white font-mono text-lg">
                {tokensPerSecond.toFixed(1)}
              </span>
              <span className="text-gray-400 text-sm ml-1">tokens/sec</span>
            </div>
          </div>

          {/* Total tokens */}
          <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
            <span className="text-gray-300 font-medium">Tokens Generated</span>
            <div className="text-right">
              <span className="text-white font-mono text-lg">
                {totalTokens.toLocaleString()}
              </span>
              <span className="text-gray-400 text-sm ml-1">tokens</span>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <div className="mt-6 pt-4 border-t border-gray-600">
          <button
            onClick={onCancel}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Cancel Generation
          </button>
        </div>
      </div>
    </div>
  );
}
