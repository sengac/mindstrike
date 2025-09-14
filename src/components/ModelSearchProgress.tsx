import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, Loader2, Search, X, Download, Database, FileCheck } from 'lucide-react';
import { useModelScanStore } from '../store/useModelScanStore';

interface ModelSearchProgressProps {
  isVisible: boolean;
  isSearching: boolean;
  isScanningModels: boolean;
  onClose?: () => void;
}

export function ModelSearchProgress({ 
  isVisible, 
  isSearching, 
  isScanningModels, 
  onClose 
}: ModelSearchProgressProps) {
  const {
    isScanning,
    canCancel,
    progress,
    startScan,
    cancelScan,
    resetScan
  } = useModelScanStore();

  // Auto-start scan when component becomes visible for model scanning
  useEffect(() => {
    if (isVisible && isScanningModels && !isScanning && progress.stage === 'idle') {
      startScan().catch(console.error);
    }
  }, [isVisible, isScanningModels, isScanning, progress.stage, startScan]);

  // Auto-close after completion
  useEffect(() => {
    if (progress.stage === 'completed' && onClose) {
      const timer = setTimeout(() => {
        onClose();
        resetScan();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [progress.stage, onClose, resetScan]);

  if (!isVisible) {
    return null;
  }

  // Get title based on operation type
  const getTitle = () => {
    if (progress.operationType === 'search') {
      return 'Model Search Progress';
    } else if (progress.operationType === 'scan') {
      return 'Model Scanning Progress';
    } else {
      return 'Finding Models';
    }
  };

  const getStageIcon = () => {
    switch (progress.stage) {
      case 'idle':
        return <Search className="w-5 h-5 text-gray-400" />;
      case 'initializing':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'fetching-huggingface':
        return <Download className="w-5 h-5 text-orange-400" />;
      case 'searching':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'checking-models':
        return <FileCheck className="w-5 h-5 text-yellow-400" />;
      case 'completing':
        return <Database className="w-5 h-5 text-green-400" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'cancelled':
        return <X className="w-5 h-5 text-gray-400" />;
      default:
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    }
  };

  const getStageColor = () => {
    if (progress.stage === 'completed') {
      return 'bg-green-900/20 border-green-600/30';
    } else if (progress.stage === 'error') {
      return 'bg-red-900/20 border-red-600/30';
    } else if (progress.stage === 'cancelled') {
      return 'bg-gray-900/20 border-gray-600/30';
    } else {
      return 'bg-blue-900/20 border-blue-600/30';
    }
  };

  const handleCancel = async () => {
    if (canCancel) {
      try {
        await cancelScan();
      } catch (error) {
        console.error('Failed to cancel operation:', error);
      }
    }
  };

  const handleClose = () => {
    if (progress.stage === 'completed' || progress.stage === 'error' || progress.stage === 'cancelled') {
      resetScan();
      onClose?.();
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getStageColor()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStageIcon()}
          <h3 className="text-white font-medium">{getTitle()}</h3>
        </div>
        <div className="flex items-center gap-2">
          {canCancel && (
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              title="Cancel scan"
            >
              Cancel
            </button>
          )}
          {(progress.stage === 'completed' || progress.stage === 'error' || progress.stage === 'cancelled') && (
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Progress Message */}
      <div className="mb-3">
        <p className="text-gray-300 text-sm">{progress.message}</p>
        {progress.currentItem && !progress.message.includes(progress.currentItem) && (
          <p className="text-gray-400 text-xs mt-1">
            Current: {progress.currentItem}
          </p>
        )}
      </div>

      {/* Progress Bar */}
      {typeof progress.progress === 'number' && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Progress</span>
            <span>{progress.progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Item Count */}
      {progress.totalItems && (
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span>Items processed</span>
          <span>{progress.completedItems || 0} / {progress.totalItems}</span>
        </div>
      )}

      {/* Error Message */}
      {progress.error && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-600/30 rounded">
          <p className="text-red-300 text-sm font-medium">Error:</p>
          <p className="text-red-200 text-xs mt-1">{progress.error}</p>
        </div>
      )}

      {/* Stage-specific information */}
      {progress.stage === 'completed' && (
        <div className="mt-3 p-3 bg-green-900/20 border border-green-600/30 rounded">
          <p className="text-green-300 text-sm">
            ✓ {progress.operationType === 'scan' ? 'Scan' : 'Search'} completed successfully!
            {progress.totalItems && ` Found ${progress.totalItems} models.`}
          </p>
        </div>
      )}

      {progress.stage === 'cancelled' && (
        <div className="mt-3 p-3 bg-gray-900/20 border border-gray-600/30 rounded">
          <p className="text-gray-300 text-sm">
            {progress.operationType === 'scan' ? 'Scan' : 'Search'} was cancelled by user.
          </p>
        </div>
      )}
    </div>
  );
}
