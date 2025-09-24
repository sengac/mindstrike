import { Loader2, HardDrive } from 'lucide-react';
import { ModelCard } from './ModelCard';
import type {
  VRAMEstimateInfo,
  ModelArchitecture,
} from '../../store/useAvailableModelsStore';

interface ModelLoadingSettings {
  gpuLayers?: number;
  contextSize?: number;
  batchSize?: number;
  threads?: number;
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

interface ModelInfo {
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
  // VRAM fields
  vramEstimates?: VRAMEstimateInfo[];
  modelArchitecture?: ModelArchitecture;
  hasVramData?: boolean;
  vramError?: string;
}

interface ModelStatus {
  loaded: boolean;
  runtimeInfo?: ModelRuntimeInfo;
}

interface ModelListProps {
  models: ModelInfo[];
  modelStatuses: Map<string, ModelStatus>;
  loading: boolean;
  loadingModelId?: string | null;
  modelLoadErrors?: Map<string, string>;
  targetModelId?: string;
  onLoad?: (modelId: string) => void;
  onUnload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onUpdateSettings?: (modelId: string, settings: ModelLoadingSettings) => void;
  formatFileSize: (bytes: number) => string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  emptyStateIcon?: React.ReactNode;
  emptyStateAction?: React.ReactNode;
}

export function ModelList({
  models,
  modelStatuses,
  loading,
  loadingModelId,
  modelLoadErrors,
  targetModelId,
  onLoad,
  onUnload,
  onDelete,
  onUpdateSettings,
  formatFileSize,
  emptyStateTitle = 'No Models',
  emptyStateDescription = 'No models available.',
  emptyStateIcon = (
    <HardDrive size={48} className="text-gray-600 mx-auto mb-4" />
  ),
  emptyStateAction,
}: ModelListProps) {
  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2
          size={24}
          className="text-blue-400 animate-spin mx-auto mb-2"
        />
        <p className="text-gray-400">Loading models...</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="text-center py-8">
        {emptyStateIcon}
        <h4 className="text-lg font-medium text-gray-400 mb-2">
          {emptyStateTitle}
        </h4>
        <p className="text-gray-500 mb-4">{emptyStateDescription}</p>
        {emptyStateAction}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {models.map(model => (
        <ModelCard
          key={model.id}
          model={model}
          status={modelStatuses.get(model.id)}
          isLoading={loadingModelId === model.id}
          loadError={modelLoadErrors?.get(model.id)}
          isTarget={targetModelId === model.id}
          onLoad={onLoad}
          onUnload={onUnload}
          onDelete={onDelete}
          onUpdateSettings={onUpdateSettings}
          formatFileSize={formatFileSize}
        />
      ))}
    </div>
  );
}
