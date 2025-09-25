import {
  Play,
  Square,
  Trash2,
  Loader2,
  Cpu,
  Settings,
  Zap,
  Clock,
  Download,
  ExternalLink,
  User,
  Heart,
  Calendar,
  X,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { FloatingTooltip } from './FloatingTooltip';
import type {
  VRAMEstimateInfo,
  ModelArchitecture,
} from '../../store/useAvailableModelsStore';
import { useSystemInformationStore } from '../../store/useSystemInformationStore';
import {
  getModelSafetyLevel,
  calculateVRAMSafety,
  formatBytes,
} from '../../utils/vramSafety';
import { VRAMRequirementsDisplay } from './VRAMRequirementsDisplay';
import {
  calculateSettingsVRAM,
  getRecommendedSettings,
  type ModelArchitectureInfo,
} from '../../shared/vramCalculator';

interface ModelLoadingSettings {
  gpuLayers?: number;
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  temperature?: number;
}

interface ModelRuntimeInfo {
  actualGpuLayers?: number;
  gpuType?: string;
  memoryUsage?: {
    vramUsedMB?: number;
    vramTotalMB?: number;
    vramPercent?: number;
  };
  loadingTime?: number;
}

interface DownloadProgress {
  progress: number;
  speed?: string;
  errorType?: string;
  errorMessage?: string;
  huggingFaceUrl?: string;
}

interface ModelInfo {
  id: string;
  name: string;
  modelId?: string; // For HuggingFace model ID
  filename: string;
  size: number;
  trainedContextLength?: number; // The context length the model was trained with
  maxContextLength?: number; // The maximum context length the model can handle
  parameterCount?: string;
  quantization?: string;
  loadingSettings?: ModelLoadingSettings;
  layerCount?: number;
  // VRAM fields
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
  // Downloadable model fields
  url?: string;
  description?: string;
  huggingFaceUrl?: string;
  username?: string;
  downloads?: number;
  likes?: number;
  updatedAt?: string;
}

interface ModelCardProps {
  model: ModelInfo;
  status?: {
    loaded: boolean;
    runtimeInfo?: ModelRuntimeInfo;
  };
  isLoading?: boolean;
  loadError?: string;
  isTarget?: boolean;
  isDownloadable?: boolean;
  isAlreadyDownloaded?: boolean;
  downloadProgress?: DownloadProgress;
  onLoad?: (modelId: string) => void;
  onUnload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onDownload?: (model: ModelInfo) => void;
  onCancelDownload?: (filename: string) => void;
  onDismissError?: (filename: string) => void;
  onUpdateSettings?: (modelId: string, settings: ModelLoadingSettings) => void;
  formatFileSize: (bytes: number) => string;
}

export function ModelCard({
  model,
  status,
  isLoading = false,
  loadError,
  isTarget = false,
  isDownloadable = false,
  isAlreadyDownloaded = false,
  downloadProgress,
  onLoad,
  onUnload,
  onDelete,
  onDownload,
  onCancelDownload,
  onDismissError,
  onUpdateSettings,
  formatFileSize,
}: ModelCardProps) {
  const isLoaded = status?.loaded ?? false;
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<ModelLoadingSettings>(
    model.loadingSettings ?? {}
  );
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [selectedPreset, setSelectedPreset] = useState<
    'conservative' | 'balanced' | 'performance' | 'custom'
  >('custom');
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const wasLoadingRef = useRef(false);
  const [showContextTooltip, setShowContextTooltip] = useState(false);
  const infoIconRef = useRef<SVGSVGElement>(null);

  // Track when loading completes successfully
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && isLoaded) {
      // Just finished loading successfully
      setShowSuccessFlash(true);
      const timer = setTimeout(() => {
        setShowSuccessFlash(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, isLoaded]);

  // Get system VRAM information for safety badge
  const systemInfo = useSystemInformationStore(state => state.systemInfo);
  const availableVramMB = systemInfo.vramState
    ? systemInfo.vramState.free / (1024 * 1024)
    : undefined;

  // Calculate overall model safety level for badge
  const modelSafetyLevel = getModelSafetyLevel(
    model.vramEstimates,
    availableVramMB
  );

  // Calculate current VRAM usage based on settings
  const estimatedVramUsage = useMemo(() => {
    if (!model.modelArchitecture) {
      return 0;
    }

    const architecture: ModelArchitectureInfo = {
      layers: model.modelArchitecture.layers,
      kvHeads: model.modelArchitecture.kvHeads,
      embeddingDim: model.modelArchitecture.embeddingDim,
      contextLength: model.modelArchitecture.contextLength,
      feedForwardDim: model.modelArchitecture.feedForwardDim,
      modelSizeMB: model.modelArchitecture.modelSizeMB,
    };

    return calculateSettingsVRAM(architecture, {
      gpuLayers: tempSettings.gpuLayers ?? -1,
      contextSize:
        tempSettings.contextSize ?? model.trainedContextLength ?? 8000,
      batchSize: tempSettings.batchSize ?? 512,
    });
  }, [
    model.modelArchitecture,
    tempSettings.gpuLayers,
    tempSettings.contextSize,
    tempSettings.batchSize,
    model.trainedContextLength,
  ]);

  // Calculate safety level for current settings
  const settingsSafety = useMemo(() => {
    if (!availableVramMB || estimatedVramUsage === 0) {
      return {
        level: 'unknown',
        percentageUsed: 0,
        description: 'Unknown VRAM usage',
      };
    }
    return calculateVRAMSafety(estimatedVramUsage, availableVramMB);
  }, [estimatedVramUsage, availableVramMB]);

  const handleSaveSettings = () => {
    // Check if there are any validation errors
    const hasErrors = Object.values(validationErrors).some(
      error => error !== ''
    );
    if (hasErrors) {
      return; // Don't save if there are validation errors
    }

    if (onUpdateSettings) {
      onUpdateSettings(model.id, tempSettings);
    }
    setShowSettings(false);
  };

  const handleApplyPreset = (
    preset: 'conservative' | 'balanced' | 'performance'
  ) => {
    if (!model.modelArchitecture || !availableVramMB) {
      return;
    }

    const architecture: ModelArchitectureInfo = {
      layers: model.modelArchitecture.layers,
      kvHeads: model.modelArchitecture.kvHeads,
      embeddingDim: model.modelArchitecture.embeddingDim,
      contextLength: model.modelArchitecture.contextLength,
      feedForwardDim: model.modelArchitecture.feedForwardDim,
      modelSizeMB: model.modelArchitecture.modelSizeMB,
    };

    const recommended = getRecommendedSettings(
      architecture,
      availableVramMB,
      preset
    );

    setTempSettings({
      gpuLayers: recommended.gpuLayers,
      contextSize: recommended.contextSize,
      batchSize: recommended.batchSize,
      temperature: tempSettings.temperature,
      threads: tempSettings.threads,
    });

    setSelectedPreset(preset);
    setValidationErrors({});
  };

  const handleCancelSettings = () => {
    setTempSettings(model.loadingSettings ?? {});
    setValidationErrors({});
    setShowSettings(false);
  };

  const formatGpuLayers = (layers?: number) => {
    if (layers === undefined) {
      return 'Auto';
    }
    if (layers === -1) {
      return 'Auto';
    }
    if (layers === 0) {
      return 'CPU Only';
    }
    return layers.toString();
  };

  // Validation functions
  const validateAndSetGpuLayers = (value: string) => {
    setSelectedPreset('custom'); // User is manually adjusting
    const num = parseInt(value);
    const maxLayers = model.layerCount ?? 100;
    if (value === '' || isNaN(num)) {
      setTempSettings(prev => ({ ...prev, gpuLayers: undefined }));
      setValidationErrors(prev => ({ ...prev, gpuLayers: '' }));
    } else if (num >= -1 && num <= maxLayers) {
      setTempSettings(prev => ({ ...prev, gpuLayers: num }));
      setValidationErrors(prev => ({ ...prev, gpuLayers: '' }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        gpuLayers: `Must be between -1 and ${maxLayers}`,
      }));
    }
  };

  const validateAndSetContextSize = (value: string) => {
    setSelectedPreset('custom'); // User is manually adjusting
    const num = parseInt(value);
    const maxContext = model.trainedContextLength ?? model.maxContextLength;
    if (value === '' || isNaN(num)) {
      setTempSettings(prev => ({ ...prev, contextSize: undefined }));
      setValidationErrors(prev => ({ ...prev, contextSize: '' }));
    } else if (maxContext && num >= 512 && num <= maxContext) {
      setTempSettings(prev => ({ ...prev, contextSize: num }));
      setValidationErrors(prev => ({ ...prev, contextSize: '' }));
    } else if (!maxContext && num >= 512) {
      // If no max context is known, allow any value >= 512
      setTempSettings(prev => ({ ...prev, contextSize: num }));
      setValidationErrors(prev => ({ ...prev, contextSize: '' }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        contextSize: maxContext
          ? `Must be between 512 and ${maxContext}`
          : 'Must be at least 512',
      }));
    }
  };

  const validateAndSetBatchSize = (value: string) => {
    setSelectedPreset('custom'); // User is manually adjusting
    const num = parseInt(value);
    if (value === '' || isNaN(num)) {
      setTempSettings(prev => ({ ...prev, batchSize: undefined }));
      setValidationErrors(prev => ({ ...prev, batchSize: '' }));
    } else if (num >= 1 && num <= 2048) {
      // 1 to 2048 (realistic for most setups)
      setTempSettings(prev => ({ ...prev, batchSize: num }));
      setValidationErrors(prev => ({ ...prev, batchSize: '' }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        batchSize: 'Must be between 1 and 2048',
      }));
    }
  };

  const validateAndSetThreads = (value: string) => {
    setSelectedPreset('custom'); // User is manually adjusting
    const num = parseInt(value);
    const maxThreads = Math.min(32, (navigator.hardwareConcurrency ?? 8) * 2); // Cap at 32 or 2x CPU cores
    if (value === '' || isNaN(num)) {
      setTempSettings(prev => ({ ...prev, threads: undefined }));
      setValidationErrors(prev => ({ ...prev, threads: '' }));
    } else if (num >= 0 && num <= maxThreads) {
      setTempSettings(prev => ({ ...prev, threads: num }));
      setValidationErrors(prev => ({ ...prev, threads: '' }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        threads: `Must be between 0 and ${maxThreads}`,
      }));
    }
  };

  const validateAndSetTemperature = (value: string) => {
    setSelectedPreset('custom'); // User is manually adjusting
    const num = parseFloat(value);
    if (value === '' || isNaN(num)) {
      setTempSettings(prev => ({ ...prev, temperature: undefined }));
      setValidationErrors(prev => ({ ...prev, temperature: '' }));
    } else if (num >= 0.0 && num <= 2.0) {
      setTempSettings(prev => ({ ...prev, temperature: num }));
      setValidationErrors(prev => ({ ...prev, temperature: '' }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        temperature: 'Must be between 0.0 and 2.0',
      }));
    }
  };

  // Input validation helpers
  const handleKeyDown = (e: React.KeyboardEvent, allowNegative = false) => {
    // Allow: backspace, delete, tab, escape, enter, decimal point, minus (if allowed)
    if (
      [8, 9, 27, 13, 46, 110, 190].indexOf(e.keyCode) !== -1 ||
      // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      (e.keyCode === 65 && e.ctrlKey === true) ||
      (e.keyCode === 67 && e.ctrlKey === true) ||
      (e.keyCode === 86 && e.ctrlKey === true) ||
      (e.keyCode === 88 && e.ctrlKey === true) ||
      // Allow home, end, left, right
      (e.keyCode >= 35 && e.keyCode <= 39)
    ) {
      return;
    }
    // Allow minus sign only if negative values are allowed and it's the first character
    if (
      allowNegative &&
      e.keyCode === 189 &&
      (e.target as HTMLInputElement).selectionStart === 0
    ) {
      return;
    }
    // Ensure that it is a number and stop the keypress
    if (
      (e.shiftKey || e.keyCode < 48 || e.keyCode > 57) &&
      (e.keyCode < 96 || e.keyCode > 105)
    ) {
      e.preventDefault();
    }
  };

  const handlePaste = (
    e: React.ClipboardEvent,
    validator: (value: string) => void
  ) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    validator(paste);
  };

  return (
    <div className="relative p-4 bg-gray-800 rounded-lg border border-gray-700">
      {/* Header Section */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {isDownloadable ? (
          <Download size={16} className="text-green-400" />
        ) : (
          <Cpu size={16} className="text-blue-400" />
        )}
        <h4 className="text-white font-medium">
          {model.modelId ?? model.name}
        </h4>
        {model.huggingFaceUrl && (
          <a
            href={model.huggingFaceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-blue-400"
            title="View on Hugging Face"
          >
            <ExternalLink size={12} />
          </a>
        )}

        {isTarget && (
          <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
            Auto-Starting
          </span>
        )}

        <span
          className={`px-2 py-1 text-xs rounded-full ${
            isLoaded ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}
        >
          {isLoaded ? 'Loaded' : 'Not Loaded'}
        </span>

        {/* VRAM Safety Indicator */}
        {model.hasVramData && availableVramMB && (
          <span
            className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${
              modelSafetyLevel === 'safe'
                ? 'bg-green-900/30 text-green-400 border border-green-600'
                : modelSafetyLevel === 'caution'
                  ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-600'
                  : modelSafetyLevel === 'risky'
                    ? 'bg-orange-900/30 text-orange-400 border border-orange-600'
                    : modelSafetyLevel === 'unsafe'
                      ? 'bg-red-900/30 text-red-400 border border-red-600'
                      : 'bg-gray-700 text-gray-400 border border-gray-600'
            }`}
            title={`VRAM compatibility: ${
              modelSafetyLevel === 'safe'
                ? 'Safe to run'
                : modelSafetyLevel === 'caution'
                  ? 'May work but use caution'
                  : modelSafetyLevel === 'risky'
                    ? 'Risky - may cause issues'
                    : modelSafetyLevel === 'unsafe'
                      ? 'Exceeds available VRAM'
                      : 'Unknown compatibility'
            }`}
          >
            <Zap size={12} />
            <span>
              {modelSafetyLevel === 'safe'
                ? 'Safe'
                : modelSafetyLevel === 'caution'
                  ? 'Caution'
                  : modelSafetyLevel === 'risky'
                    ? 'Risky'
                    : modelSafetyLevel === 'unsafe'
                      ? 'Unsafe'
                      : 'Unknown'}
            </span>
          </span>
        )}

        {model.parameterCount && (
          <span className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-full">
            {model.parameterCount}
          </span>
        )}

        {model.quantization && (
          <span className="px-2 py-1 text-xs bg-orange-600 text-white rounded-full">
            {model.quantization}
          </span>
        )}
      </div>

      {/* Description */}
      {model.description && (
        <p className="text-gray-400 text-sm mb-3">{model.description}</p>
      )}

      {/* Basic Details */}
      <div className="space-y-1 text-sm mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-28">File:</span>
          <span className="text-gray-300 font-mono">{model.filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-28">Size:</span>
          <span className="text-gray-300">{formatFileSize(model.size)}</span>
        </div>
        {(model.trainedContextLength ?? model.maxContextLength) && (
          <div className="flex items-center gap-2">
            <div className="text-gray-400 min-w-[7rem] flex items-center gap-1 whitespace-nowrap">
              <span>Training context:</span>
              <div className="relative inline-flex">
                <Info
                  ref={infoIconRef}
                  size={14}
                  className="text-gray-500 hover:text-gray-300 cursor-help transition-colors"
                  onMouseEnter={() => setShowContextTooltip(true)}
                  onMouseLeave={() => setShowContextTooltip(false)}
                />
                <FloatingTooltip
                  targetRef={infoIconRef}
                  isVisible={showContextTooltip}
                >
                  <div
                    className="text-xs text-gray-300 space-y-2"
                    style={{ width: '260px' }}
                  >
                    <p className="font-semibold text-gray-200 whitespace-normal">
                      What is Training Context?
                    </p>
                    <p className="whitespace-normal leading-relaxed">
                      The training context (or context window) is the maximum
                      number of tokens the model can process at once. This
                      includes both your input and the model's response.
                    </p>
                    <p className="text-gray-400 whitespace-normal leading-relaxed">
                      <span className="font-medium">Note:</span> This is the
                      absolute maximum. Actual usable context may be limited by
                      available VRAM.
                    </p>
                  </div>
                </FloatingTooltip>
              </div>
            </div>
            <span className="text-gray-300">
              {model.trainedContextLength ? (
                <>
                  {model.trainedContextLength.toLocaleString()} tokens
                  {model.maxContextLength &&
                    model.maxContextLength !== model.trainedContextLength && (
                      <span className="text-gray-500">
                        {' '}
                        (max: {model.maxContextLength.toLocaleString()})
                      </span>
                    )}
                </>
              ) : model.maxContextLength ? (
                <>{model.maxContextLength.toLocaleString()} tokens</>
              ) : null}
            </span>
          </div>
        )}
        {model.username && (
          <div className="flex items-center gap-2">
            <User size={12} className="text-gray-400" />
            <span className="text-gray-400 w-24">By:</span>
            <a
              href={`https://huggingface.co/${model.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-blue-200 hover:underline transition-colors"
            >
              {model.username}
            </a>
          </div>
        )}
      </div>

      {/* VRAM Requirements Display or Loading Indicator */}
      {isDownloadable && !model.hasVramData && !model.vramError ? (
        <div className="mt-2 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin text-purple-400" />
          <span className="text-xs text-purple-300">
            Fetching VRAM requirements and training context...
          </span>
        </div>
      ) : (
        <VRAMRequirementsDisplay
          vramEstimates={model.vramEstimates}
          modelArchitecture={model.modelArchitecture}
          hasVramData={model.hasVramData}
          vramError={model.vramError}
          compactMode={false}
        />
      )}

      {/* Model Stats for downloadable models */}
      {(model.downloads ?? model.likes ?? model.updatedAt) && (
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          {model.downloads && (
            <div className="flex items-center gap-1">
              <Download size={12} />
              <span>{model.downloads.toLocaleString()} downloads</span>
            </div>
          )}
          {model.likes && (
            <div className="flex items-center gap-1">
              <Heart size={12} />
              <span>{model.likes.toLocaleString()} likes</span>
            </div>
          )}
          {model.updatedAt && (
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>
                Updated {new Date(model.updatedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Download Progress */}
      {downloadProgress && !downloadProgress.errorType && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-400" />
              <span className="text-sm text-blue-400">
                Downloading... {downloadProgress.progress}%
              </span>
              {downloadProgress.speed && (
                <span className="text-xs text-gray-400">
                  ({downloadProgress.speed})
                </span>
              )}
            </div>
            {onCancelDownload && (
              <button
                onClick={() => onCancelDownload(model.filename)}
                className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400"
                title="Cancel download"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Download Error */}
      {downloadProgress?.errorType && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={16}
              className="text-red-400 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-red-200">
                  Download Error
                </span>
                {downloadProgress.errorType === '403' &&
                  downloadProgress.huggingFaceUrl && (
                    <a
                      href={downloadProgress.huggingFaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white transition-colors"
                    >
                      <ExternalLink size={10} />
                      Request Access
                    </a>
                  )}
              </div>
              <p className="text-sm text-red-300">
                {downloadProgress.errorMessage ?? 'Download failed'}
              </p>
              {downloadProgress.errorType === '403' && (
                <p className="text-xs text-red-400 mt-1">
                  This model requires permission to access. Click the
                  acknowledgement button on Hugging Face.
                </p>
              )}
            </div>
            {onDismissError && (
              <button
                onClick={() => onDismissError(model.filename)}
                className="p-1 hover:bg-red-800/50 rounded transition-colors text-red-400 hover:text-red-300"
                title="Dismiss error"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Runtime Information */}
      {isLoaded && status?.runtimeInfo && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-20">GPU Type:</span>
            <span className="text-gray-300 flex items-center gap-1">
              <Zap size={12} className="text-yellow-400" />
              {status.runtimeInfo.gpuType ?? 'Unknown'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-20">GPU Layers:</span>
            <span className="text-gray-300">
              {formatGpuLayers(status.runtimeInfo.actualGpuLayers)}
            </span>
          </div>

          {status.runtimeInfo.loadingTime && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20">Load Time:</span>
              <span className="text-gray-300 flex items-center gap-1">
                <Clock size={12} className="text-blue-400" />
                {(status.runtimeInfo.loadingTime / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* Load Error Display */}
      {loadError && !isLoading && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-600/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={16}
              className="text-red-400 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-red-200">
                  Model Load Failed
                </span>
              </div>
              <p className="text-sm text-red-300">{loadError}</p>
              {loadError.toLowerCase().includes('memory') && (
                <p className="text-xs text-red-400 mt-2">
                  Try reducing GPU layers, context size, or unload other models
                  to free up memory.
                </p>
              )}
            </div>
            <button
              onClick={onLoad ? () => onLoad(model.id) : undefined}
              className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white transition-colors"
              title="Retry loading"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons - Floating */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {/* Settings button */}
        {onUpdateSettings && !isDownloadable && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-blue-400"
            title="Model settings"
          >
            <Settings size={14} />
          </button>
        )}

        {/* Download/Load/Unload buttons */}
        {isDownloadable ? (
          <button
            onClick={onDownload ? () => onDownload(model) : undefined}
            disabled={!onDownload || isAlreadyDownloaded || !!downloadProgress}
            className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-green-400 disabled:text-gray-600 disabled:cursor-not-allowed"
            title={
              isAlreadyDownloaded
                ? 'Already downloaded'
                : downloadProgress
                  ? 'Downloading...'
                  : 'Download model'
            }
          >
            {downloadProgress ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isAlreadyDownloaded ? (
              <CheckCircle size={14} className="text-green-400" />
            ) : (
              <Download size={14} />
            )}
          </button>
        ) : isLoaded ? (
          <button
            onClick={onUnload ? () => onUnload(model.id) : undefined}
            disabled={!onUnload}
            className={`px-3 py-1.5 rounded transition-all duration-200 flex items-center gap-1.5 border ${
              showSuccessFlash
                ? 'bg-green-600/20 text-green-400 border-green-500 animate-pulse'
                : 'hover:bg-gray-700 text-gray-400 hover:text-orange-400 disabled:opacity-50 disabled:cursor-not-allowed border-gray-600 hover:border-orange-500'
            }`}
            title="Unload model"
          >
            {showSuccessFlash ? (
              <>
                <CheckCircle size={14} />
                <span className="text-xs">Loaded!</span>
              </>
            ) : (
              <>
                <Square size={14} />
                <span className="text-xs">Unload</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={onLoad ? () => onLoad(model.id) : undefined}
            disabled={isLoading || !onLoad}
            className={`px-3 py-1.5 rounded transition-all duration-200 flex items-center gap-1.5 border ${
              isLoading
                ? 'bg-blue-600/20 text-blue-400 border-blue-500 cursor-wait animate-pulse'
                : loadError
                  ? 'bg-red-600/20 text-red-400 border-red-500 hover:bg-red-600/30'
                  : 'hover:bg-gray-700 text-gray-400 hover:text-green-400 disabled:text-gray-600 disabled:cursor-not-allowed border-gray-600 hover:border-green-500'
            }`}
            title={
              isLoading
                ? 'Loading model...'
                : loadError
                  ? 'Retry loading model'
                  : 'Load model'
            }
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Loading...</span>
              </>
            ) : loadError ? (
              <>
                <AlertTriangle size={14} />
                <span className="text-xs">Retry</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span className="text-xs">Load</span>
              </>
            )}
          </button>
        )}
        {!isDownloadable && (
          <button
            onClick={onDelete ? () => onDelete(model.id) : undefined}
            disabled={!onDelete}
            className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete model"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && onUpdateSettings && (
        <div className="mt-4 pt-4 border-t border-gray-600">
          <h5 className="text-white text-sm font-medium mb-3">
            Advanced Settings
          </h5>

          {/* VRAM Usage Monitor */}
          {model.modelArchitecture &&
            availableVramMB &&
            estimatedVramUsage > 0 && (
              <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">
                    Estimated VRAM Usage
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      settingsSafety.level === 'safe'
                        ? 'text-green-400'
                        : settingsSafety.level === 'caution'
                          ? 'text-yellow-400'
                          : settingsSafety.level === 'risky'
                            ? 'text-orange-400'
                            : settingsSafety.level === 'unsafe'
                              ? 'text-red-400'
                              : 'text-gray-400'
                    }`}
                  >
                    {formatBytes(estimatedVramUsage * 1024 * 1024)} /{' '}
                    {formatBytes(availableVramMB * 1024 * 1024)}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      settingsSafety.level === 'safe'
                        ? 'bg-green-500'
                        : settingsSafety.level === 'caution'
                          ? 'bg-yellow-500'
                          : settingsSafety.level === 'risky'
                            ? 'bg-orange-500'
                            : settingsSafety.level === 'unsafe'
                              ? 'bg-red-500'
                              : 'bg-gray-500'
                    }`}
                    style={{
                      width: `${Math.min(100, settingsSafety.percentageUsed)}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {settingsSafety.description}
                </div>
              </div>
            )}

          {/* Preset Buttons */}
          {model.modelArchitecture && availableVramMB && (
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-2">
                Quick Presets
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleApplyPreset('conservative')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    selectedPreset === 'conservative'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title="Use 50% of available VRAM for maximum stability"
                >
                  Conservative
                </button>
                <button
                  onClick={() => handleApplyPreset('balanced')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    selectedPreset === 'balanced'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title="Use 70% of available VRAM for good balance"
                >
                  Balanced
                </button>
                <button
                  onClick={() => handleApplyPreset('performance')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    selectedPreset === 'performance'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title="Use 90% of available VRAM for maximum performance"
                >
                  Performance
                </button>
                <button
                  disabled
                  className={`px-3 py-2 text-xs rounded transition-colors cursor-not-allowed ${
                    selectedPreset === 'custom'
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                  title="Manual settings"
                >
                  Custom
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                GPU Layers
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="-1"
                  max={model.layerCount ?? 100}
                  value={tempSettings.gpuLayers ?? -1}
                  onChange={e => validateAndSetGpuLayers(e.target.value)}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="-1"
                    max={model.layerCount ?? 100}
                    value={tempSettings.gpuLayers ?? ''}
                    onChange={e => validateAndSetGpuLayers(e.target.value)}
                    onKeyDown={e => handleKeyDown(e, true)}
                    onPaste={e => handlePaste(e, validateAndSetGpuLayers)}
                    placeholder="-1"
                    className={`w-16 px-2 py-1 text-xs bg-gray-700 border rounded text-white focus:outline-none ${
                      validationErrors.gpuLayers
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-600 focus:border-blue-500'
                    }`}
                  />
                  <span className="text-xs text-gray-400 w-12">
                    {tempSettings.gpuLayers === -1
                      ? 'Auto'
                      : tempSettings.gpuLayers === 0
                        ? 'CPU'
                        : tempSettings.gpuLayers === undefined
                          ? 'Auto'
                          : 'GPU'}
                  </span>
                </div>
              </div>
              {validationErrors.gpuLayers && (
                <div className="text-xs text-red-400 mt-1">
                  {validationErrors.gpuLayers}
                </div>
              )}
              {!validationErrors.gpuLayers && (
                <div className="text-xs text-gray-500 mt-1">
                  -1: Auto, 0: CPU only, 1-{model.layerCount ?? 100}: Specific
                  layers
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Context Size
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="512"
                  max={
                    model.trainedContextLength ??
                    model.maxContextLength ??
                    32768
                  }
                  step="512"
                  value={
                    tempSettings.contextSize ?? model.trainedContextLength ?? ''
                  }
                  onChange={e => validateAndSetContextSize(e.target.value)}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  disabled={
                    !model.trainedContextLength && !model.maxContextLength
                  }
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="512"
                    max={
                      model.trainedContextLength ??
                      model.maxContextLength ??
                      undefined
                    }
                    step="512"
                    value={tempSettings.contextSize ?? ''}
                    onChange={e => validateAndSetContextSize(e.target.value)}
                    onKeyDown={e => handleKeyDown(e)}
                    onPaste={e => handlePaste(e, validateAndSetContextSize)}
                    placeholder={model.trainedContextLength?.toString() ?? ''}
                    className={`w-20 px-2 py-1 text-xs bg-gray-700 border rounded text-white focus:outline-none ${
                      validationErrors.contextSize
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-600 focus:border-blue-500'
                    }`}
                  />
                  <span className="text-xs text-gray-400 w-12">tokens</span>
                </div>
              </div>
              {validationErrors.contextSize && (
                <div className="text-xs text-red-400 mt-1">
                  {validationErrors.contextSize}
                </div>
              )}
              {!validationErrors.contextSize &&
                (model.trainedContextLength ?? model.maxContextLength) && (
                  <div className="text-xs text-gray-500 mt-1">
                    512 - {model.trainedContextLength ?? model.maxContextLength}{' '}
                    tokens
                  </div>
                )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Batch Size
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="2048"
                  value={tempSettings.batchSize ?? 512}
                  onChange={e => validateAndSetBatchSize(e.target.value)}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="2048"
                    value={tempSettings.batchSize ?? ''}
                    onChange={e => validateAndSetBatchSize(e.target.value)}
                    onKeyDown={e => handleKeyDown(e)}
                    onPaste={e => handlePaste(e, validateAndSetBatchSize)}
                    placeholder="512"
                    className={`w-16 px-2 py-1 text-xs bg-gray-700 border rounded text-white focus:outline-none ${
                      validationErrors.batchSize
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-600 focus:border-blue-500'
                    }`}
                  />
                  <span className="text-xs text-gray-400 w-12">size</span>
                </div>
              </div>
              {validationErrors.batchSize && (
                <div className="text-xs text-red-400 mt-1">
                  {validationErrors.batchSize}
                </div>
              )}
              {!validationErrors.batchSize && (
                <div className="text-xs text-gray-500 mt-1">1 - 2048</div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Threads
              </label>
              <div className="flex items-center gap-3">
                {(() => {
                  const maxThreads = Math.min(
                    32,
                    (navigator.hardwareConcurrency ?? 8) * 2
                  );
                  return (
                    <>
                      <input
                        type="range"
                        min="0"
                        max={maxThreads}
                        value={tempSettings.threads ?? 0}
                        onChange={e => validateAndSetThreads(e.target.value)}
                        className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max={maxThreads}
                          value={tempSettings.threads ?? ''}
                          onChange={e => validateAndSetThreads(e.target.value)}
                          onKeyDown={e => handleKeyDown(e)}
                          onPaste={e => handlePaste(e, validateAndSetThreads)}
                          placeholder="0"
                          className={`w-16 px-2 py-1 text-xs bg-gray-700 border rounded text-white focus:outline-none ${
                            validationErrors.threads
                              ? 'border-red-500 focus:border-red-500'
                              : 'border-gray-600 focus:border-blue-500'
                          }`}
                        />
                        <span className="text-xs text-gray-400 w-12">
                          {tempSettings.threads === 0 ||
                          tempSettings.threads === undefined
                            ? 'Auto'
                            : 'cores'}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
              {validationErrors.threads && (
                <div className="text-xs text-red-400 mt-1">
                  {validationErrors.threads}
                </div>
              )}
              {!validationErrors.threads && (
                <div className="text-xs text-gray-500 mt-1">
                  0: Auto, 1 -{' '}
                  {Math.min(32, (navigator.hardwareConcurrency ?? 8) * 2)}{' '}
                  threads
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Temperature
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={tempSettings.temperature ?? 0.7}
                  onChange={e => validateAndSetTemperature(e.target.value)}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={tempSettings.temperature ?? ''}
                    onChange={e => validateAndSetTemperature(e.target.value)}
                    onKeyDown={e => handleKeyDown(e)}
                    onPaste={e => handlePaste(e, validateAndSetTemperature)}
                    placeholder="0.7"
                    className={`w-16 px-2 py-1 text-xs bg-gray-700 border rounded text-white focus:outline-none ${
                      validationErrors.temperature
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-600 focus:border-blue-500'
                    }`}
                  />
                  <span className="text-xs text-gray-400 w-12">temp</span>
                </div>
              </div>
              {validationErrors.temperature && (
                <div className="text-xs text-red-400 mt-1">
                  {validationErrors.temperature}
                </div>
              )}
              {!validationErrors.temperature && (
                <div className="text-xs text-gray-500 mt-1">
                  0.0: Deterministic, 1.0: Balanced, 2.0: Creative
                </div>
              )}
            </div>
          </div>

          {/* VRAM Warning */}
          {settingsSafety.level === 'risky' && (
            <div className="mt-3 p-2 bg-orange-900/20 border border-orange-600/50 rounded-lg flex items-start gap-2">
              <AlertTriangle size={14} className="text-orange-400 mt-0.5" />
              <div className="text-xs text-orange-400">
                <p className="font-medium mb-1">High VRAM Usage Warning</p>
                <p>
                  These settings will use{' '}
                  {Math.round(settingsSafety.percentageUsed)}% of available
                  VRAM. This may cause instability or crashes.
                </p>
              </div>
            </div>
          )}
          {settingsSafety.level === 'unsafe' && (
            <div className="mt-3 p-2 bg-red-900/20 border border-red-600/50 rounded-lg flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 mt-0.5" />
              <div className="text-xs text-red-400">
                <p className="font-medium mb-1">Exceeds Available VRAM</p>
                <p>
                  These settings require{' '}
                  {Math.round(settingsSafety.percentageUsed)}% of available
                  VRAM. The model will likely fail to load or crash.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSaveSettings}
              disabled={
                Object.values(validationErrors).some(error => error !== '') ||
                settingsSafety.level === 'unsafe'
              }
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Save Settings
            </button>
            <button
              onClick={handleCancelSettings}
              className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
