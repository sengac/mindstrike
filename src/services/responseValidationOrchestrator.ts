import { ConversationMessage } from '../types';
import {
  ResponseScanner,
  OffScreenValidator,
  RenderableContent,
  ValidationResult,
  ValidationReport,
} from './responseValidator';
import { DebugLLMService } from './debugLLMService';

export interface ValidationProgress {
  stage:
    | 'scanning'
    | 'validating'
    | 'fixing'
    | 'retrying'
    | 'completed'
    | 'failed';
  currentItem?: string;
  totalItems?: number;
  completedItems?: number;
  error?: string;
  fixAttempts?: number;
}

export interface ValidationConfig {
  enableValidation: boolean;
  maxRetryAttempts: number;
  timeoutMs: number;
  skipValidationForTypes?: string[];
}

/**
 * Main orchestrator for response validation and error correction
 */
export class ResponseValidationOrchestrator {
  private static config: ValidationConfig = {
    enableValidation: true,
    maxRetryAttempts: 3,
    timeoutMs: 30000,
    skipValidationForTypes: [],
  };

  private static progressCallbacks: ((progress: ValidationProgress) => void)[] =
    [];

  /**
   * Configure the validation system
   */
  static configure(config: Partial<ValidationConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Subscribe to validation progress updates
   */
  static onProgress(callback: (progress: ValidationProgress) => void) {
    this.progressCallbacks.push(callback);
    return () => {
      const index = this.progressCallbacks.indexOf(callback);
      if (index > -1) {
        this.progressCallbacks.splice(index, 1);
      }
    };
  }

  private static notifyProgress(progress: ValidationProgress) {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in validation progress callback:', error);
      }
    });
  }

  /**
   * Main entry point: validate and fix message content before rendering
   */
  static async validateAndFixMessage(message: ConversationMessage): Promise<{
    message: ConversationMessage;
    validationReport: ValidationReport;
    hasChanges: boolean;
  }> {
    if (!this.config.enableValidation) {
      return {
        message,
        validationReport: {
          hasRenderableContent: false,
          renderableItems: [],
          validationResults: [],
          needsCorrection: false,
        },
        hasChanges: false,
      };
    }

    try {
      // Stage 1: Scan for renderable content (silent scanning)
      const renderableItems = ResponseScanner.scanForRenderableContent(
        message.content
      );

      if (renderableItems.length === 0) {
        // No renderable content found - no need to show notification
        return {
          message,
          validationReport: {
            hasRenderableContent: false,
            renderableItems: [],
            validationResults: [],
            needsCorrection: false,
          },
          hasChanges: false,
        };
      }

      // Stage 2: Validate each renderable item (still silent)
      const validationResults: ValidationResult[] = [];
      const itemsNeedingFix: { item: RenderableContent; error: string }[] = [];

      for (let i = 0; i < renderableItems.length; i++) {
        const item = renderableItems[i];

        // Skip validation for certain types if configured
        if (this.config.skipValidationForTypes?.includes(item.type)) {
          validationResults.push({ success: true });
          continue;
        }

        const validationResult = await OffScreenValidator.validateContent(item);
        validationResults.push(validationResult);

        if (!validationResult.success && validationResult.error) {
          itemsNeedingFix.push({ item, error: validationResult.error });
        }
      }

      // Only show notification if there are items that need fixing
      if (itemsNeedingFix.length === 0) {
        // All content validated successfully - no need to show notification
        return {
          message,
          validationReport: {
            hasRenderableContent: renderableItems.length > 0,
            renderableItems,
            validationResults,
            needsCorrection: false,
          },
          hasChanges: false,
        };
      }

      // Now we know we need to fix something - start showing progress
      this.notifyProgress({ stage: 'scanning' });
      this.notifyProgress({
        stage: 'validating',
        totalItems: renderableItems.length,
        completedItems: renderableItems.length,
      });

      // Stage 3: Fix items that failed validation
      let fixedContent = message.content;
      let hasChanges = false;

      if (itemsNeedingFix.length > 0) {
        this.notifyProgress({
          stage: 'fixing',
          totalItems: itemsNeedingFix.length,
          completedItems: 0,
        });

        for (let i = 0; i < itemsNeedingFix.length; i++) {
          const { item, error } = itemsNeedingFix[i];

          this.notifyProgress({
            stage: 'fixing',
            totalItems: itemsNeedingFix.length,
            completedItems: i,
            currentItem: `${item.type}:${item.id}`,
            fixAttempts: 0,
          });

          const fixResult = await this.fixItemWithRetry(item, error);

          if (fixResult.success && fixResult.fixedContent) {
            // Replace the original content with fixed content
            const originalContentPattern = this.escapeRegExp(item.content);
            const regex = new RegExp(originalContentPattern, 'g');
            fixedContent = fixedContent.replace(regex, fixResult.fixedContent);
            hasChanges = true;
          }

          this.notifyProgress({
            stage: 'fixing',
            totalItems: itemsNeedingFix.length,
            completedItems: i + 1,
            currentItem: `${item.type}:${item.id}`,
          });
        }
      }

      this.notifyProgress({
        stage: 'completed',
        totalItems: renderableItems.length,
        completedItems: renderableItems.length,
      });

      const finalMessage = hasChanges
        ? { ...message, content: fixedContent }
        : message;

      return {
        message: finalMessage,
        validationReport: {
          hasRenderableContent: renderableItems.length > 0,
          renderableItems,
          validationResults,
          needsCorrection: itemsNeedingFix.length > 0,
          finalContent: fixedContent,
        },
        hasChanges,
      };
    } catch (error) {
      this.notifyProgress({
        stage: 'failed',
        error:
          error instanceof Error ? error.message : 'Unknown validation error',
      });

      // Return original message if validation fails
      return {
        message,
        validationReport: {
          hasRenderableContent: false,
          renderableItems: [],
          validationResults: [],
          needsCorrection: false,
        },
        hasChanges: false,
      };
    }
  }

  /**
   * Attempt to fix an item with retry logic
   */
  private static async fixItemWithRetry(
    item: RenderableContent,
    error: string
  ): Promise<{ success: boolean; fixedContent?: string; finalError?: string }> {
    let retryCount = 0;

    while (retryCount < this.config.maxRetryAttempts) {
      this.notifyProgress({
        stage: 'retrying',
        currentItem: `${item.type}:${item.id}`,
        fixAttempts: retryCount + 1,
      });

      try {
        // Request fix from debug LLM
        const fixResponse = await DebugLLMService.requestFix(
          item,
          error,
          retryCount
        );

        if (!fixResponse.success || !fixResponse.fixedContent) {
          retryCount++;
          continue;
        }

        // Validate the fix
        const testItem: RenderableContent = {
          ...item,
          content: fixResponse.fixedContent,
        };

        const validationResult =
          await OffScreenValidator.validateContent(testItem);

        if (validationResult.success) {
          return { success: true, fixedContent: fixResponse.fixedContent };
        } else {
          // Fix didn't work, try again with the new error
          error = validationResult.error || 'Validation failed after fix';
          retryCount++;
        }
      } catch (fixError) {
        retryCount++;
        error =
          fixError instanceof Error ? fixError.message : 'Fix attempt failed';
      }
    }

    return {
      success: false,
      finalError: `Failed to fix after ${this.config.maxRetryAttempts} attempts: ${error}`,
    };
  }

  /**
   * Escape special characters for regex
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get current configuration
   */
  static getConfig(): ValidationConfig {
    return { ...this.config };
  }

  /**
   * Enable or disable validation globally
   */
  static setEnabled(enabled: boolean) {
    this.config.enableValidation = enabled;
  }

  /**
   * Cleanup resources
   */
  static cleanup() {
    OffScreenValidator.cleanup();
    this.progressCallbacks.length = 0;
  }
}
