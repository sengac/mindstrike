import { useState, useEffect, useCallback } from 'react';
import type { ConversationMessage } from '../types';
import type { ValidationProgress } from '../services/responseValidationOrchestrator';
import { ResponseValidationOrchestrator } from '../services/responseValidationOrchestrator';
import { logger } from '../utils/logger';

export interface UseResponseValidationReturn {
  isValidating: boolean;
  validationProgress: ValidationProgress | null;
  validationEnabled: boolean;
  setValidationEnabled: (enabled: boolean) => void;
  validateMessage: (message: ConversationMessage) => Promise<{
    message: ConversationMessage;
    hasChanges: boolean;
  }>;
  dismissNotification: () => void;
  showNotification: boolean;
}

export function useResponseValidation(): UseResponseValidationReturn {
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] =
    useState<ValidationProgress | null>(null);
  const [validationEnabled, setValidationEnabledState] = useState(true);
  const [showNotification, setShowNotification] = useState(false);

  // Subscribe to validation progress
  useEffect(() => {
    const unsubscribe = ResponseValidationOrchestrator.onProgress(progress => {
      setValidationProgress(progress);

      // Show notification when validation starts
      if (progress.stage === 'scanning' || progress.stage === 'validating') {
        setIsValidating(true);
        setShowNotification(true);
      }

      // Hide validation state when completed or failed
      if (progress.stage === 'completed' || progress.stage === 'failed') {
        setIsValidating(false);
      }
    });

    return unsubscribe;
  }, []);

  // Configure validation system when enabled state changes
  useEffect(() => {
    ResponseValidationOrchestrator.setEnabled(validationEnabled);
  }, [validationEnabled]);

  const setValidationEnabled = useCallback((enabled: boolean) => {
    setValidationEnabledState(enabled);

    // Store preference in localStorage
    try {
      localStorage.setItem(
        'responseValidationEnabled',
        JSON.stringify(enabled)
      );
    } catch (error) {
      logger.warn('Failed to save validation preference:', { error });
    }
  }, []);

  // Load validation preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('responseValidationEnabled');
      if (saved !== null) {
        const enabled = JSON.parse(saved);
        setValidationEnabledState(enabled);
      }
    } catch (error) {
      logger.warn('Failed to load validation preference:', { error });
    }
  }, []);

  const validateMessage = useCallback(
    async (
      message: ConversationMessage
    ): Promise<{
      message: ConversationMessage;
      hasChanges: boolean;
    }> => {
      if (!validationEnabled) {
        return { message, hasChanges: false };
      }

      if (message.role !== 'assistant') {
        return { message, hasChanges: false };
      }

      try {
        const result =
          await ResponseValidationOrchestrator.validateAndFixMessage(message);
        return {
          message: result.message,
          hasChanges: result.hasChanges,
        };
      } catch (error) {
        logger.error('Message validation failed:', error);
        return { message, hasChanges: false };
      }
    },
    [validationEnabled]
  );

  const dismissNotification = useCallback(() => {
    setShowNotification(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ResponseValidationOrchestrator.cleanup();
    };
  }, []);

  return {
    isValidating,
    validationProgress,
    validationEnabled,
    setValidationEnabled,
    validateMessage,
    dismissNotification,
    showNotification,
  };
}
