import { useState, useMemo } from 'react';
import { HardDrive, Zap, Settings2 } from 'lucide-react';
import { useSystemInformationStore } from '../../store/useSystemInformationStore';
import {
  calculateVRAMSafety,
  formatBytes,
  getRecommendedContextSize,
} from '../../utils/vramSafety';
import {
  calculateAllVRAMEstimates,
  type VRAMEstimateInfo,
  type ModelArchitectureInfo,
} from '../../shared/vramCalculator';
import type { ModelArchitecture } from '../../store/useAvailableModelsStore';

interface VRAMRequirementsDisplayProps {
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
  compactMode?: boolean;
  className?: string;
}

export function VRAMRequirementsDisplay({
  vramEstimates: providedEstimates,
  modelArchitecture,
  hasVramData,
  vramError,
  compactMode = false,
  className = '',
}: VRAMRequirementsDisplayProps) {
  // Get system VRAM information
  const systemInfo = useSystemInformationStore(state => state.systemInfo);
  const availableVramMB = systemInfo.vramState
    ? systemInfo.vramState.free / (1024 * 1024)
    : undefined;

  // State for user-adjustable context
  const defaultContext = modelArchitecture?.contextLength ?? 8192;
  const [userMaxContext, setUserMaxContext] = useState(defaultContext);
  const [showContextSlider, setShowContextSlider] = useState(false);

  // Calculate VRAM estimates dynamically if we have architecture info
  const vramEstimates = useMemo(() => {
    if (modelArchitecture && showContextSlider) {
      const architectureInfo: ModelArchitectureInfo = {
        layers: modelArchitecture.layers,
        kvHeads: modelArchitecture.kvHeads,
        embeddingDim: modelArchitecture.embeddingDim,
        contextLength: modelArchitecture.contextLength,
        feedForwardDim: modelArchitecture.feedForwardDim,
        modelSizeMB: modelArchitecture.modelSizeMB,
      };
      return calculateAllVRAMEstimates(architectureInfo, userMaxContext);
    }
    return providedEstimates;
  }, [modelArchitecture, userMaxContext, showContextSlider, providedEstimates]);

  // Get recommended context size
  const recommendedContextIdx = vramEstimates
    ? getRecommendedContextSize(vramEstimates, availableVramMB ?? 0)
    : -1;

  // Show error state if VRAM data unavailable
  if (vramError && !hasVramData) {
    return (
      <div
        className={`text-xs text-yellow-500 flex items-center gap-1 ${className}`}
      >
        <HardDrive size={12} />
        <span>VRAM data unavailable</span>
      </div>
    );
  }

  // Don't render if no VRAM data
  if (!hasVramData || !vramEstimates || vramEstimates.length === 0) {
    return null;
  }

  if (compactMode) {
    // Compact mode for list views
    return (
      <div className={`mt-2 ${className}`}>
        <div className="flex items-center gap-2 mb-1">
          <HardDrive size={12} className="text-purple-400" />
          <span className="text-xs text-purple-300">VRAM Requirements</span>
          {availableVramMB && (
            <span className="text-xs text-gray-500">
              (Available: {formatBytes(availableVramMB * 1024 * 1024)})
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(vramEstimates ?? []).slice(0, 4).map((estimate, idx) => {
            const safety = calculateVRAMSafety(
              estimate.conservative,
              availableVramMB
            );
            const isRecommended = idx === recommendedContextIdx;
            const expectedGB = (estimate.expected / 1024).toFixed(1);

            return (
              <div
                key={estimate.config.label}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                  isRecommended
                    ? 'bg-blue-900/30 border border-blue-600 text-blue-400'
                    : safety.level === 'safe'
                      ? 'bg-green-900/20 text-green-400'
                      : safety.level === 'caution'
                        ? 'bg-yellow-900/20 text-yellow-400'
                        : safety.level === 'risky'
                          ? 'bg-orange-900/20 text-orange-400'
                          : safety.level === 'unsafe'
                            ? 'bg-red-900/20 text-red-400'
                            : 'bg-gray-800 text-gray-400'
                }`}
                title={safety.description}
              >
                <span>{safety.icon}</span>
                <span>
                  {estimate.config.label}: {expectedGB}GB
                </span>
                {safety.level !== 'unknown' && (
                  <span className="opacity-75">
                    ({Math.round(safety.percentageUsed)}%)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode for detailed views
  return (
    <div className={`mt-3 pt-3 border-t border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-purple-400" />
          <span className="text-gray-300 font-medium text-sm">
            VRAM Requirements
          </span>
          {modelArchitecture && (
            <button
              onClick={() => setShowContextSlider(!showContextSlider)}
              className="p-1 rounded hover:bg-gray-700 transition-colors"
              title="Adjust context size for VRAM calculation"
            >
              <Settings2 size={14} className="text-gray-400" />
            </button>
          )}
        </div>
        {availableVramMB && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Zap size={12} />
            <span>Available: {formatBytes(availableVramMB * 1024 * 1024)}</span>
          </div>
        )}
      </div>

      {/* Context adjustment slider */}
      {showContextSlider && modelArchitecture && (
        <div className="mb-3 p-3 bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400">
              Max Context for Calculation
            </label>
            <span className="text-xs text-gray-300 font-mono">
              {Math.round(userMaxContext / 1000)}K tokens
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1000}
              max={defaultContext}
              step={100}
              value={userMaxContext}
              onChange={e => setUserMaxContext(parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1K</span>
            <span>{Math.round(defaultContext / 2 / 1000)}K</span>
            <span>{Math.round(defaultContext / 1000)}K (max)</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 overflow-hidden rounded-lg">
        {(vramEstimates ?? []).slice(0, 4).map((estimate, idx) => {
          const expectedGB = (estimate.expected / 1024).toFixed(1);
          const safety = calculateVRAMSafety(
            estimate.conservative,
            availableVramMB
          );
          const isRecommended = idx === recommendedContextIdx;

          // Determine background colors
          let bgClass = 'bg-gray-800';
          let textClass = 'text-gray-400';

          if (isRecommended) {
            bgClass = 'bg-blue-900/30';
            textClass = 'text-blue-400';
          } else if (safety.level === 'safe') {
            bgClass = 'bg-green-900/20';
            textClass = 'text-green-400';
          } else if (safety.level === 'caution') {
            bgClass = 'bg-yellow-900/20';
            textClass = 'text-yellow-400';
          } else if (safety.level === 'risky') {
            bgClass = 'bg-orange-900/20';
            textClass = 'text-orange-400';
          } else if (safety.level === 'unsafe') {
            bgClass = 'bg-red-900/20';
            textClass = 'text-red-400';
          }

          return (
            <div
              key={estimate.config.label}
              className={`flex flex-col items-center justify-center p-3 ${bgClass} transition-all`}
              title={safety.description}
            >
              <div className={`text-xs font-medium ${textClass} mb-1`}>
                {estimate.config.label}
              </div>
              <div className={`text-sm font-semibold ${textClass}`}>
                {expectedGB} GB
              </div>
              {safety.level !== 'unknown' && (
                <div className={`text-xs ${textClass} opacity-75 mt-1`}>
                  {Math.round(safety.percentageUsed)}%
                </div>
              )}
              {isRecommended && (
                <div className="text-xs text-blue-400 mt-1">✓ Best fit</div>
              )}
            </div>
          );
        })}
      </div>

      {modelArchitecture && (
        <div className="mt-2 text-xs text-gray-500">
          {modelArchitecture.layers && (
            <span>Layers: {modelArchitecture.layers} • </span>
          )}
          {modelArchitecture.kvHeads && (
            <span>KV Heads: {modelArchitecture.kvHeads} • </span>
          )}
          {modelArchitecture.embeddingDim && (
            <span>Embedding: {modelArchitecture.embeddingDim}</span>
          )}
          {modelArchitecture.contextLength && (
            <span>
              {' '}
              • Training: {Math.round(modelArchitecture.contextLength / 1000)}K
            </span>
          )}
        </div>
      )}
    </div>
  );
}
