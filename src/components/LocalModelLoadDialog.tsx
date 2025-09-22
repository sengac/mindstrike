import { useState, useEffect, useCallback } from 'react';
import { X, Cpu, Download, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useLocalModelsStore } from '../store/useLocalModelsStore';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';
import { ModelList } from './shared/ModelList';

interface LocalModelLoadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetModelId?: string; // The model that needs to be loaded (optional)
  onModelLoaded: () => void; // Callback when model is successfully loaded
}

export function LocalModelLoadDialog({
  isOpen,
  onClose,
  targetModelId,
  onModelLoaded,
}: LocalModelLoadDialogProps) {
  // Hooks
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );
  const { setActiveView } = useAppStore();

  // Store state and actions
  const {
    localModels,
    modelStatuses,
    isLoading: loading,
    loadingModelId,
    fetchModelsAndStatuses,
    loadModel: storeLoadModel,
    unloadModel: storeUnloadModel,
    deleteModel: storeDeleteModel,
    updateModelSettings: storeUpdateModelSettings,
    formatFileSize,
    isModelLoaded,
  } = useLocalModelsStore();

  // Local state for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteModelId, setPendingDeleteModelId] = useState<string>('');

  // Wrapper functions to handle target model completion
  const loadModel = useCallback(
    async (modelId: string, isAutoLoad = false) => {
      await storeLoadModel(modelId, isAutoLoad);

      // Handle target model completion
      if (
        targetModelId &&
        modelId === targetModelId &&
        isModelLoaded(modelId)
      ) {
        onModelLoaded();
        onClose();
      }
    },
    [storeLoadModel, targetModelId, onModelLoaded, onClose, isModelLoaded]
  );

  const handleDelete = useCallback((modelId: string) => {
    setPendingDeleteModelId(modelId);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    try {
      await storeDeleteModel(pendingDeleteModelId);
    } finally {
      setPendingDeleteModelId('');
      setShowDeleteConfirm(false);
    }
  }, [pendingDeleteModelId, storeDeleteModel]);

  // Initial data loading
  useEffect(() => {
    if (isOpen) {
      fetchModelsAndStatuses();
    }
  }, [isOpen, fetchModelsAndStatuses]);

  // Auto-load target model when data is available
  useEffect(() => {
    if (!isOpen || !targetModelId || loadingModelId || loading) return;

    const targetModel = localModels.find(m => m.id === targetModelId);
    const isAlreadyLoaded = modelStatuses.get(targetModelId)?.loaded;

    if (targetModel && !isAlreadyLoaded) {
      loadModel(targetModelId, true);
    }
  }, [
    isOpen,
    targetModelId,
    localModels,
    modelStatuses,
    loadingModelId,
    loading,
    loadModel,
  ]);

  if (!shouldRender) return null;

  // Don't show dialog UI when auto-loading a specific model
  // Just handle the loading logic in the background
  if (targetModelId) {
    return null;
  }

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-4xl"
      className="max-h-[80vh] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Cpu size={24} className="text-blue-400" />
          <h2 className="text-xl font-semibold text-white">
            Local Model Management
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!loading && localModels.length > 0 && (
            <button
              onClick={() => {
                setActiveView('settings');
                handleClose();
                // Scroll to Available Models section after a brief delay
                setTimeout(() => {
                  const element = document.getElementById('available-models');
                  if (element) {
                    element.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }
                }, 300);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
              title="Go to Available Models section"
            >
              <Download size={16} />
              Available Models
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
        {/* Model List */}
        <div>
          <ModelList
            models={localModels}
            modelStatuses={modelStatuses}
            loading={loading}
            loadingModelId={loadingModelId ?? undefined}
            targetModelId={targetModelId}
            onLoad={loadModel}
            onUnload={storeUnloadModel}
            onDelete={handleDelete}
            onUpdateSettings={storeUpdateModelSettings}
            formatFileSize={formatFileSize}
            emptyStateTitle="No Local Models"
            emptyStateDescription="Download models in Settings to get started."
            emptyStateIcon={
              <Cpu size={48} className="text-gray-600 mx-auto mb-4" />
            }
            emptyStateAction={
              <button
                onClick={() => {
                  setActiveView('settings');
                  handleClose();
                  // Scroll to Available Models section after a brief delay
                  setTimeout(() => {
                    const element = document.getElementById('available-models');
                    if (element) {
                      element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }
                  }, 300);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors mx-auto"
                title="Go to Available Models section"
              >
                <Download size={16} />
                Available Models
              </button>
            }
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Model"
        message="Are you sure you want to delete this model? This action cannot be undone and will permanently remove the model from your system."
        confirmText="Delete Model"
        type="danger"
        icon={<Trash2 size={20} />}
      />
    </BaseDialog>
  );
}
