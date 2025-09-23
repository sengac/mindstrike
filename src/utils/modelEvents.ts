// Simple event system for model-related changes
type ModelEventType =
  | 'models-changed'
  | 'local-model-downloaded'
  | 'service-added'
  | 'service-removed';

class ModelEventEmitter {
  private readonly listeners: Map<ModelEventType, (() => void)[]> = new Map();

  on(event: ModelEventType, callback: () => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: ModelEventType, callback: () => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  emit(event: ModelEventType) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback());
    }
  }
}

export const modelEvents = new ModelEventEmitter();
