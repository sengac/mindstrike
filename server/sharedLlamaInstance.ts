import { getLlama } from 'node-llama-cpp';

class SharedLlamaInstance {
  private static instance: SharedLlamaInstance;
  private llamaInstance: Awaited<ReturnType<typeof getLlama>> | null = null;
  private initializationPromise: Promise<
    Awaited<ReturnType<typeof getLlama>>
  > | null = null;
  private isInferenceActive = false;
  private readonly pendingSystemInfoRequests: Array<
    () => Promise<void> | void
  > = [];

  public static getInstance(): SharedLlamaInstance {
    if (!SharedLlamaInstance.instance) {
      SharedLlamaInstance.instance = new SharedLlamaInstance();
    }
    return SharedLlamaInstance.instance;
  }

  public async getLlama(): Promise<Awaited<ReturnType<typeof getLlama>>> {
    if (this.llamaInstance) {
      return this.llamaInstance;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeLlama();
    this.llamaInstance = await this.initializationPromise;
    this.initializationPromise = null;

    return this.llamaInstance;
  }

  public async getLlamaForSystemInfo(): Promise<
    Awaited<ReturnType<typeof getLlama>>
  > {
    // If inference is active, queue the entire request without touching llama
    if (this.isInferenceActive) {
      return new Promise(resolve => {
        this.pendingSystemInfoRequests.push(async () => {
          const llama = await this.getLlama();
          resolve(llama);
        });
      });
    }

    // If not busy, get llama normally
    return await this.getLlama();
  }

  public markInferenceStart(): void {
    this.isInferenceActive = true;
  }

  public markInferenceEnd(): void {
    this.isInferenceActive = false;

    // Process any pending system info requests
    while (this.pendingSystemInfoRequests.length > 0) {
      const request = this.pendingSystemInfoRequests.shift();
      if (request) {
        // Process asynchronously to avoid blocking
        setTimeout(() => {
          const result = request();
          // Handle both sync and async functions
          if (result instanceof Promise) {
            result.catch(err =>
              console.error('Error processing queued system info request:', err)
            );
          }
        }, 0);
      }
    }
  }

  private async initializeLlama(): Promise<
    Awaited<ReturnType<typeof getLlama>>
  > {
    return await getLlama({ gpu: 'auto' });
  }
}

export const sharedLlamaInstance = SharedLlamaInstance.getInstance();
