import { HardDrive, Zap } from 'lucide-react';
import { useSystemInformationStore } from '../../store/useSystemInformationStore';
import {
  calculateVRAMSafety,
  formatBytes,
  getRecommendedContextSize,
} from '../../utils/vramSafety';
import type {
  VRAMEstimateInfo,
  ModelArchitecture,
} from '../../store/useAvailableModelsStore';

interface VRAMRequirementsDisplayProps {
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
  compactMode?: boolean;
  showLegend?: boolean;
  className?: string;
}

export function VRAMRequirementsDisplay({
  vramEstimates,
  modelArchitecture,
  hasVramData,
  vramError,
  compactMode = false,
  showLegend = true,
  className = '',
}: VRAMRequirementsDisplayProps) {
  // Get system VRAM information
  const systemInfo = useSystemInformationStore(state => state.systemInfo);
  const availableVramMB = systemInfo.vramState
    ? systemInfo.vramState.free / (1024 * 1024)
    : undefined;

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
          {vramEstimates.slice(0, 4).map((estimate, idx) => {
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-purple-400" />
          <span className="text-gray-300 font-medium text-sm">
            VRAM Requirements
          </span>
        </div>
        {availableVramMB && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Zap size={12} />
            <span>Available: {formatBytes(availableVramMB * 1024 * 1024)}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {vramEstimates.slice(0, 4).map((estimate, idx) => {
          const expectedGB = (estimate.expected / 1024).toFixed(1);
          const conservativeGB = (estimate.conservative / 1024).toFixed(1);
          const safety = calculateVRAMSafety(
            estimate.conservative,
            availableVramMB
          );
          const isRecommended = idx === recommendedContextIdx;

          return (
            <div
              key={estimate.config.label}
              className={`flex items-center justify-between p-2 rounded-md transition-all ${
                isRecommended
                  ? 'bg-blue-900/20 border border-blue-600'
                  : safety.level !== 'unknown'
                    ? `${safety.bgColor} border ${safety.borderColor}`
                    : 'bg-gray-800 border border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${isRecommended ? 'font-medium' : ''}`}
                  title={safety.description}
                >
                  {safety.icon}
                </span>
                <span
                  className={`${
                    isRecommended
                      ? 'text-blue-400'
                      : safety.level !== 'unknown'
                        ? safety.textColor
                        : 'text-gray-400'
                  }`}
                >
                  {estimate.config.label}
                  {isRecommended && (
                    <span className="ml-1 text-xs">(Recommended)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm ${
                    safety.level === 'safe'
                      ? 'text-green-400'
                      : safety.level === 'caution'
                        ? 'text-yellow-400'
                        : safety.level === 'risky'
                          ? 'text-orange-400'
                          : safety.level === 'unsafe'
                            ? 'text-red-400'
                            : 'text-gray-300'
                  }`}
                >
                  {expectedGB} GB
                  <span className="text-gray-500 text-xs">
                    {' '}
                    (~{conservativeGB} GB)
                  </span>
                </span>
                {safety.level !== 'unknown' && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      safety.level === 'safe'
                        ? 'bg-green-900/50 text-green-400'
                        : safety.level === 'caution'
                          ? 'bg-yellow-900/50 text-yellow-400'
                          : safety.level === 'risky'
                            ? 'bg-orange-900/50 text-orange-400'
                            : 'bg-red-900/50 text-red-400'
                    }`}
                    title={safety.description}
                  >
                    {Math.round(safety.percentageUsed)}%
                  </span>
                )}
              </div>
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
        </div>
      )}

      {/* Safety Legend */}
      {showLegend && availableVramMB && (
        <div className="mt-3 pt-2 border-t border-gray-700/50">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span>🟢</span>
              <span className="text-gray-500">&lt;70%</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🟡</span>
              <span className="text-gray-500">70-90%</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🟠</span>
              <span className="text-gray-500">90-100%</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🔴</span>
              <span className="text-gray-500">&gt;100%</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
