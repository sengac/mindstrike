import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Loader2, X, Settings, Brain } from 'lucide-react';
import { ValidationProgress } from '../services/responseValidationOrchestrator';

interface ValidationStatusNotificationProps {
  isVisible: boolean;
  progress: ValidationProgress | null;
  onDismiss: () => void;
  onToggleValidation?: (enabled: boolean) => void;
  validationEnabled?: boolean;
}

export function ValidationStatusNotification({ 
  isVisible, 
  progress, 
  onDismiss, 
  onToggleValidation,
  validationEnabled = true 
}: ValidationStatusNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Auto-hide on completion after 5 seconds
    if (progress?.stage === 'completed' && isVisible) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000);
      setAutoHideTimer(timer);
    }
    
    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [progress?.stage, isVisible, onDismiss]);

  if (!isVisible || !progress) {
    return null;
  }

  const getStageIcon = () => {
    switch (progress.stage) {
      case 'scanning':
      case 'validating':
      case 'fixing':
      case 'retrying':
        return <Loader2 size={16} className="animate-spin text-blue-400" />;
      case 'completed':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'failed':
        return <AlertTriangle size={16} className="text-red-400" />;
      default:
        return <Brain size={16} className="text-blue-400" />;
    }
  };

  const getStageMessage = () => {
    switch (progress.stage) {
      case 'scanning':
        return 'Scanning response for renderable content...';
      case 'validating':
        return `Validating content (${progress.completedItems}/${progress.totalItems})...`;
      case 'fixing':
        return `Fixing rendering issues (${progress.completedItems}/${progress.totalItems})...`;
      case 'retrying':
        return `Attempting fix #${progress.fixAttempts} for ${progress.currentItem}...`;
      case 'completed':
        return progress.totalItems === 0 
          ? 'Response validated successfully' 
          : `Fixed ${progress.completedItems} content item(s)`;
      case 'failed':
        return `Validation failed: ${progress.error}`;
      default:
        return 'Processing response...';
    }
  };

  const getProgressPercentage = () => {
    if (!progress.totalItems || progress.totalItems === 0) return 0;
    return Math.round((progress.completedItems || 0) / progress.totalItems * 100);
  };

  const getBgColor = () => {
    switch (progress.stage) {
      case 'completed':
        return 'bg-green-900/20 border-green-700/50';
      case 'failed':
        return 'bg-red-900/20 border-red-700/50';
      default:
        return 'bg-blue-900/20 border-blue-700/50';
    }
  };

  return (
    <div className={`w-full rounded-lg border p-3 shadow-lg backdrop-blur-sm transition-all duration-300 z-10 mb-4 ${getBgColor()}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {getStageIcon()}
          <div className="flex-1">
            <div className="text-sm font-medium text-white">
              Response Validation
            </div>
            <div className="text-xs text-gray-300 mt-1">
              {getStageMessage()}
            </div>
            
            {progress.totalItems && progress.totalItems > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>{getProgressPercentage()}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div 
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
              </div>
            )}

            {isExpanded && (
              <div className="mt-3 space-y-2">
                {progress.currentItem && (
                  <div className="text-xs text-gray-400">
                    Current: {progress.currentItem}
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <label className="flex items-center space-x-2 text-xs">
                    <input
                      type="checkbox"
                      checked={validationEnabled}
                      onChange={(e) => onToggleValidation?.(e.target.checked)}
                      className="w-3 h-3 rounded"
                    />
                    <span className="text-gray-300">Enable validation</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Toggle details"
          >
            <Settings size={12} className="text-gray-400" />
          </button>
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Dismiss"
          >
            <X size={12} className="text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
