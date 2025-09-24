import type { DynamicModelInfo } from '../../../modelFetcher';

// Multi-part model fixture data
export const multiPartModelFixtures = {
  // A complete 6-part model
  llama70B: {
    baseInfo: {
      name: 'Llama-3.3-70B-Instruct Q6_K',
      url: 'https://huggingface.co/models/llama-70b/resolve/main/Llama-3.3-70B-Instruct.Q6_K.gguf-00001-of-00006.gguf',
      filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00001-of-00006.gguf',
      size: 15000000000, // 15GB per part
      description:
        'Llama 3.3 70B Instruct (70B) with Q6_K quantization [6-part model]',
      contextLength: 8192,
      parameterCount: '70B',
      quantization: 'Q6_K',
      downloads: 50000,
      modelId: 'meta-llama/Llama-3.3-70B-Instruct',
      accessibility: 'accessible' as const,
      huggingFaceUrl:
        'https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct',
      username: 'meta-llama',
      isMultiPart: true,
      totalParts: 6,
      allPartFiles: [
        'Llama-3.3-70B-Instruct.Q6_K.gguf-00001-of-00006.gguf',
        'Llama-3.3-70B-Instruct.Q6_K.gguf-00002-of-00006.gguf',
        'Llama-3.3-70B-Instruct.Q6_K.gguf-00003-of-00006.gguf',
        'Llama-3.3-70B-Instruct.Q6_K.gguf-00004-of-00006.gguf',
        'Llama-3.3-70B-Instruct.Q6_K.gguf-00005-of-00006.gguf',
        'Llama-3.3-70B-Instruct.Q6_K.gguf-00006-of-00006.gguf',
      ],
      totalSize: 90000000000, // 90GB total
    } as DynamicModelInfo,

    parts: [
      {
        filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00001-of-00006.gguf',
        size: 15000000000,
      },
      {
        filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00002-of-00006.gguf',
        size: 15000000000,
      },
      {
        filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00003-of-00006.gguf',
        size: 15000000000,
      },
      {
        filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00004-of-00006.gguf',
        size: 15000000000,
      },
      {
        filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00005-of-00006.gguf',
        size: 15000000000,
      },
      {
        filename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00006-of-00006.gguf',
        size: 15000000000,
      },
    ],
  },

  // A smaller 3-part model
  qwen32B: {
    baseInfo: {
      name: 'Qwen-32B-Instruct Q8_0',
      url: 'https://huggingface.co/models/qwen/resolve/main/Qwen-32B-Instruct.Q8_0.gguf-00001-of-00003.gguf',
      filename: 'Qwen-32B-Instruct.Q8_0.gguf-00001-of-00003.gguf',
      size: 12000000000, // 12GB per part
      description:
        'Qwen 32B Instruct (32B) with Q8_0 quantization [3-part model]',
      contextLength: 32768,
      parameterCount: '32B',
      quantization: 'Q8_0',
      downloads: 25000,
      modelId: 'qwen/Qwen-32B-Instruct',
      accessibility: 'accessible' as const,
      huggingFaceUrl: 'https://huggingface.co/qwen/Qwen-32B-Instruct',
      username: 'qwen',
      isMultiPart: true,
      totalParts: 3,
      allPartFiles: [
        'Qwen-32B-Instruct.Q8_0.gguf-00001-of-00003.gguf',
        'Qwen-32B-Instruct.Q8_0.gguf-00002-of-00003.gguf',
        'Qwen-32B-Instruct.Q8_0.gguf-00003-of-00003.gguf',
      ],
      totalSize: 36000000000, // 36GB total
    } as DynamicModelInfo,

    parts: [
      {
        filename: 'Qwen-32B-Instruct.Q8_0.gguf-00001-of-00003.gguf',
        size: 12000000000,
      },
      {
        filename: 'Qwen-32B-Instruct.Q8_0.gguf-00002-of-00003.gguf',
        size: 12000000000,
      },
      {
        filename: 'Qwen-32B-Instruct.Q8_0.gguf-00003-of-00003.gguf',
        size: 12000000000,
      },
    ],
  },

  // A single-part model for comparison
  llama8B: {
    baseInfo: {
      name: 'Llama-3.1-8B-Instruct Q4_K_M',
      url: 'https://huggingface.co/models/llama-8b/resolve/main/Llama-3.1-8B-Instruct.Q4_K_M.gguf',
      filename: 'Llama-3.1-8B-Instruct.Q4_K_M.gguf',
      size: 5000000000, // 5GB
      description: 'Llama 3.1 8B Instruct (8B) with Q4_K_M quantization',
      contextLength: 8192,
      parameterCount: '8B',
      quantization: 'Q4_K_M',
      downloads: 100000,
      modelId: 'meta-llama/Llama-3.1-8B-Instruct',
      accessibility: 'accessible' as const,
      huggingFaceUrl: 'https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct',
      username: 'meta-llama',
      isMultiPart: false,
    } as DynamicModelInfo,
  },

  // An incomplete multi-part model (missing parts)
  incompleteMistral: {
    baseInfo: {
      name: 'Mistral-70B-Instruct Q4_K_S',
      filename: 'Mistral-70B-Instruct.Q4_K_S.gguf-00001-of-00004.gguf',
      modelId: 'mistral/Mistral-70B-Instruct',
      isMultiPart: true,
      totalParts: 4,
      // Only has 2 parts available
      availableParts: [
        'Mistral-70B-Instruct.Q4_K_S.gguf-00001-of-00004.gguf',
        'Mistral-70B-Instruct.Q4_K_S.gguf-00003-of-00004.gguf',
      ],
    },
  },
};

// Mock HuggingFace API response for multi-part models
export const mockHuggingFaceResponse = {
  llama70B: {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    downloads: 50000,
    tags: ['text-generation', 'conversational'],
    gated: false,
    likes: 1500,
    lastModified: '2024-01-15T00:00:00Z',
    siblings: [
      {
        rfilename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00001-of-00006.gguf',
        size: 15000000000,
      },
      {
        rfilename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00002-of-00006.gguf',
        size: 15000000000,
      },
      {
        rfilename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00003-of-00006.gguf',
        size: 15000000000,
      },
      {
        rfilename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00004-of-00006.gguf',
        size: 15000000000,
      },
      {
        rfilename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00005-of-00006.gguf',
        size: 15000000000,
      },
      {
        rfilename: 'Llama-3.3-70B-Instruct.Q6_K.gguf-00006-of-00006.gguf',
        size: 15000000000,
      },
      { rfilename: 'README.md', size: 5000 },
      { rfilename: 'config.json', size: 2000 },
    ],
  },
};

// Helper function to create mock ReadableStream for testing
export function createMockStream(
  chunks: Uint8Array[]
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      controller.close();
    },
  });
}

// Helper function to create mock fetch responses for multi-part downloads
export function createMultiPartFetchMocks(
  parts: Array<{ filename: string; size: number }>
) {
  const responses: Map<string, Response> = new Map();

  parts.forEach((part, index) => {
    const chunkSize = 1024; // 1KB chunks for testing
    const numChunks = Math.min(10, Math.ceil(part.size / chunkSize)); // Limit chunks for testing
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < numChunks; i++) {
      chunks.push(new Uint8Array(chunkSize).fill(index + 1)); // Fill with part number
    }

    const stream = createMockStream(chunks);
    const response = new Response(stream, {
      status: 200,
      headers: {
        'Content-Length': part.size.toString(),
      },
    });

    responses.set(part.filename, response);
  });

  return responses;
}

// Test utilities for multi-part models
export const multiPartTestUtils = {
  isMultiPartFile(filename: string): {
    isMultiPart: boolean;
    partNumber?: number;
    totalParts?: number;
    baseFilename?: string;
  } {
    const multiPartPattern = /^(.+\.gguf)-(\d{5})-of-(\d{5})\.gguf$/;
    const match = filename.match(multiPartPattern);

    if (match) {
      return {
        isMultiPart: true,
        partNumber: parseInt(match[2], 10),
        totalParts: parseInt(match[3], 10),
        baseFilename: match[1],
      };
    }

    return { isMultiPart: false };
  },

  generatePartFilenames(baseFilename: string, totalParts: number): string[] {
    const parts: string[] = [];
    for (let i = 1; i <= totalParts; i++) {
      parts.push(
        `${baseFilename}-${String(i).padStart(5, '0')}-of-${String(totalParts).padStart(5, '0')}.gguf`
      );
    }
    return parts;
  },

  calculateTotalSize(parts: Array<{ size: number }>): number {
    return parts.reduce((total, part) => total + part.size, 0);
  },
};
