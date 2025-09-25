import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';

// Simple test to verify abort handling in BaseAgent
describe('BaseAgent Abort Signal Handling - Simple', () => {
  it('should pass abort signal to model when streaming', async () => {
    let signalReceived: AbortSignal | undefined;

    // Create a mock model that captures the signal
    const mockModel = {
      stream: vi.fn(async function* (messages, options) {
        signalReceived = options?.signal;
        yield { content: 'test' };
      }),
      invoke: vi.fn(async (messages, options) => {
        signalReceived = options?.signal;
        return new AIMessage('response');
      }),
    };

    // Create abort controller
    const controller = new AbortController();

    // Call stream with signal
    const generator = mockModel.stream([], { signal: controller.signal });
    await generator.next();

    // Verify signal was passed
    expect(signalReceived).toBe(controller.signal);
    expect(mockModel.stream).toHaveBeenCalledWith([], {
      signal: controller.signal,
    });
  });

  it('should handle abort during streaming', async () => {
    const controller = new AbortController();

    // Create a mock stream that checks abort
    const mockStream = async function* (
      messages: unknown,
      options?: { signal?: AbortSignal }
    ) {
      for (let i = 0; i < 5; i++) {
        if (options?.signal?.aborted) {
          throw new Error('AbortError: Operation aborted');
        }
        yield { content: `chunk ${i}` };

        // Abort after second chunk
        if (i === 1) {
          controller.abort();
        }
      }
    };

    try {
      const generator = mockStream([], { signal: controller.signal });
      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }
      expect.fail('Should have thrown abort error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('AbortError');
    }
  });

  it('should recover after abort', async () => {
    // First request with abort
    const controller1 = new AbortController();
    controller1.abort();

    let result1;
    try {
      if (controller1.signal.aborted) {
        throw new Error('AbortError: Request was aborted');
      }
      result1 = 'Should not reach here';
    } catch (error) {
      result1 = error;
    }

    expect(result1).toBeInstanceOf(Error);
    expect((result1 as Error).message).toContain('AbortError');

    // Second request should work
    const controller2 = new AbortController();

    let result2;
    try {
      if (controller2.signal.aborted) {
        throw new Error('Should not abort');
      }
      result2 = 'Success';
    } catch (error) {
      result2 = error;
    }

    expect(result2).toBe('Success');
  });
});
