import {
  Play,
  Square,
  Trash2,
  Loader2,
  Cpu,
  Settings,
  Zap,
  Clock,
} from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

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

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    filename: string;
    size: number;
    contextLength?: number;
    parameterCount?: string;
    quantization?: string;
    loadingSettings?: ModelLoadingSettings;
    layerCount?: number;
    maxContextLength?: number;
  };
  status?: {
    loaded: boolean;
    runtimeInfo?: ModelRuntimeInfo;
  };
  isLoading?: boolean;
  isTarget?: boolean;
  onLoad?: (modelId: string) => void;
  onUnload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onUpdateSettings?: (modelId: string, settings: ModelLoadingSettings) => void;
  formatFileSize: (bytes: number) => string;
}

export function ModelCard({
  model,
  status,
  isLoading = false,
  isTarget = false,
  onLoad,
  onUnload,
  onDelete,
  onUpdateSettings,
  formatFileSize,
}: ModelCardProps) {
  const isLoaded = status?.loaded || false;
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<ModelLoadingSettings>(
    model.loadingSettings || {}
  );
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const { removeModelSettings } = useAppStore();

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

  const handleResetSettings = () => {
    // Remove model settings from localStorage
    removeModelSettings(model.id);

    // Reset to empty settings (which will use server defaults)
    const defaultSettings: ModelLoadingSettings = {};
    setTempSettings(defaultSettings);
    setValidationErrors({});

    // Trigger save to apply the reset
    if (onUpdateSettings) {
      onUpdateSettings(model.id, defaultSettings);
    }
  };

  const handleCancelSettings = () => {
    setTempSettings(model.loadingSettings || {});
    setValidationErrors({});
    setShowSettings(false);
  };

  const formatGpuLayers = (layers?: number) => {
    if (layers === undefined) return 'Auto';
    if (layers === -1) return 'Auto';
    if (layers === 0) return 'CPU Only';
    return layers.toString();
  };

  // Validation functions
  const validateAndSetGpuLayers = (value: string) => {
    const num = parseInt(value);
    const maxLayers = model.layerCount || 100;
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
    const num = parseInt(value);
    const maxContext = model.maxContextLength || 32768;
    if (value === '' || isNaN(num)) {
      setTempSettings(prev => ({ ...prev, contextSize: undefined }));
      setValidationErrors(prev => ({ ...prev, contextSize: '' }));
    } else if (num >= 512 && num <= maxContext) {
      setTempSettings(prev => ({ ...prev, contextSize: num }));
      setValidationErrors(prev => ({ ...prev, contextSize: '' }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        contextSize: `Must be between 512 and ${maxContext}`,
      }));
    }
  };

  const validateAndSetBatchSize = (value: string) => {
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
    const num = parseInt(value);
    const maxThreads = Math.min(32, (navigator.hardwareConcurrency || 8) * 2); // Cap at 32 or 2x CPU cores
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
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Cpu size={16} className="text-blue-400" />
            <h4 className="text-white font-medium">{model.name}</h4>

            {isTarget && (
              <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                Auto-Starting
              </span>
            )}

            <span
              className={`px-2 py-1 text-xs rounded-full ${
                isLoaded
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              {isLoaded ? 'Loaded' : 'Not Loaded'}
            </span>

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

          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20">File:</span>
              <span className="text-gray-300 font-mono">{model.filename}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20">Size:</span>
              <span className="text-gray-300">
                {formatFileSize(model.size)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20">Context:</span>
              <span className="text-gray-300">
                {(
                  model.loadingSettings?.contextSize ||
                  model.maxContextLength ||
                  model.contextLength ||
                  4096
                ).toLocaleString()}{' '}
                tokens
                {model.maxContextLength && (
                  <span className="text-gray-500">
                    {' '}
                    (Maximum: {model.maxContextLength.toLocaleString()})
                  </span>
                )}
              </span>
            </div>

            {/* Runtime Information */}
            {isLoaded && status?.runtimeInfo && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-20">GPU Type:</span>
                  <span className="text-gray-300 flex items-center gap-1">
                    <Zap size={12} className="text-yellow-400" />
                    {status.runtimeInfo.gpuType || 'Unknown'}
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
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {/* Settings button */}
          {onUpdateSettings && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-blue-400"
              title="Model settings"
            >
              <Settings size={14} />
            </button>
          )}

          {isLoaded ? (
            <button
              onClick={onUnload ? () => onUnload(model.id) : undefined}
              disabled={!onUnload}
              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Unload model"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={onLoad ? () => onLoad(model.id) : undefined}
              disabled={isLoading || !onLoad}
              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-green-400 disabled:text-gray-600 disabled:cursor-not-allowed"
              title="Load model"
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
            </button>
          )}
          <button
            onClick={onDelete ? () => onDelete(model.id) : undefined}
            disabled={!onDelete}
            className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete model"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && onUpdateSettings && (
        <div className="mt-4 pt-4 border-t border-gray-600">
          <h5 className="text-white text-sm font-medium mb-3">
            Advanced Settings
          </h5>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                GPU Layers
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="-1"
                  max={model.layerCount || 100}
                  value={tempSettings.gpuLayers ?? -1}
                  onChange={e => validateAndSetGpuLayers(e.target.value)}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="-1"
                    max={model.layerCount || 100}
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
                  -1: Auto, 0: CPU only, 1-{model.layerCount || 100}: Specific
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
                  max={model.maxContextLength || 32768}
                  step="512"
                  value={tempSettings.contextSize ?? 4096}
                  onChange={e => validateAndSetContextSize(e.target.value)}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="512"
                    max={model.maxContextLength || 32768}
                    step="512"
                    value={tempSettings.contextSize ?? ''}
                    onChange={e => validateAndSetContextSize(e.target.value)}
                    onKeyDown={e => handleKeyDown(e)}
                    onPaste={e => handlePaste(e, validateAndSetContextSize)}
                    placeholder="4096"
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
              {!validationErrors.contextSize && (
                <div className="text-xs text-gray-500 mt-1">
                  512 - {model.maxContextLength || 32768} tokens
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
                    (navigator.hardwareConcurrency || 8) * 2
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
                  {Math.min(32, (navigator.hardwareConcurrency || 8) * 2)}{' '}
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
                  value={tempSettings.temperature ?? 1.0}
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
                    placeholder="1.0"
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

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSaveSettings}
              disabled={Object.values(validationErrors).some(
                error => error !== ''
              )}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Save Settings
            </button>
            <button
              onClick={handleResetSettings}
              className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
            >
              Reset
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
