/**
 * Test fixtures for GGUF VRAM calculator
 * Contains mock binary data and expected metadata
 */

import { GGUFValueType, type GGUFMetadata } from '../../ggufVramCalculator';

// Helper to create a buffer with GGUF header
export const createGGUFHeader = (version: number = 3): Buffer => {
  const buffer = Buffer.alloc(24);
  // Magic number "GGUF"
  buffer.write('GGUF', 0, 4, 'utf8');
  // Version
  buffer.writeUInt32LE(version, 4);
  // Tensor count (unused, set to 0)
  buffer.writeBigUInt64LE(0n, 8);
  // Key-value count (will be updated based on metadata)
  buffer.writeBigUInt64LE(0n, 16);
  return buffer;
};

// Helper to write a string to buffer
const writeString = (buffer: Buffer, offset: number, str: string): number => {
  // Write string length as uint64
  buffer.writeBigUInt64LE(BigInt(str.length), offset);
  offset += 8;
  // Write string content
  buffer.write(str, offset, str.length, 'utf8');
  return offset + str.length;
};

// Helper to write a metadata key-value pair
const writeMetadataEntry = (
  buffer: Buffer,
  offset: number,
  key: string,
  valueType: GGUFValueType,
  value: string | number | bigint
): number => {
  // Write key
  offset = writeString(buffer, offset, key);

  // Write value type
  buffer.writeUInt32LE(valueType, offset);
  offset += 4;

  // Write value based on type
  switch (valueType) {
    case GGUFValueType.UINT32:
      buffer.writeUInt32LE(value, offset);
      offset += 4;
      break;
    case GGUFValueType.FLOAT32:
      buffer.writeFloatLE(value, offset);
      offset += 4;
      break;
    case GGUFValueType.STRING:
      offset = writeString(buffer, offset, value);
      break;
    case GGUFValueType.UINT64:
      buffer.writeBigUInt64LE(BigInt(value), offset);
      offset += 8;
      break;
    default:
      throw new Error(`Unsupported value type: ${valueType}`);
  }

  return offset;
};

// Create a complete GGUF buffer with metadata
export const createCompleteGGUFBuffer = (
  metadata: Record<string, string | number | bigint>
): Buffer => {
  // Start with header
  const header = createGGUFHeader();

  // Calculate total size needed
  let totalSize = header.length;
  const metadataEntries = Object.entries(metadata);

  // Estimate size for metadata (rough estimate, will allocate more than needed)
  totalSize += metadataEntries.length * 100;

  const buffer = Buffer.alloc(totalSize);
  header.copy(buffer, 0);

  // Update key-value count
  buffer.writeBigUInt64LE(BigInt(metadataEntries.length), 16);

  let offset = header.length;

  // Write each metadata entry
  for (const [key, value] of metadataEntries) {
    let valueType: GGUFValueType;

    // Determine value type
    if (typeof value === 'string') {
      valueType = GGUFValueType.STRING;
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value < 0x100000000) {
          valueType = GGUFValueType.UINT32;
        } else {
          valueType = GGUFValueType.UINT64;
        }
      } else {
        valueType = GGUFValueType.FLOAT32;
      }
    } else {
      continue; // Skip unsupported types
    }

    offset = writeMetadataEntry(buffer, offset, key, valueType, value);
  }

  // Return only the used portion
  return buffer.subarray(0, offset);
};

// Test fixtures for different model architectures
export const testModelConfigs = {
  // Small 7B model configuration
  llama7B: {
    'llama.block_count': 32,
    'llama.attention.head_count_kv': 8,
    'llama.embedding_length': 4096,
    'llama.context_length': 32768,
    'llama.feed_forward_length': 11008,
    'general.architecture': 'llama',
    'general.name': 'Test Llama 7B',
    'general.quantization_version': 2,
  },

  // Medium 13B model configuration
  llama13B: {
    'llama.block_count': 40,
    'llama.attention.head_count_kv': 40,
    'llama.embedding_length': 5120,
    'llama.context_length': 32768,
    'llama.feed_forward_length': 13824,
    'general.architecture': 'llama',
    'general.name': 'Test Llama 13B',
    'general.quantization_version': 2,
  },

  // Large 70B model configuration
  llama70B: {
    'llama.block_count': 80,
    'llama.attention.head_count_kv': 8,
    'llama.embedding_length': 8192,
    'llama.context_length': 32768,
    'llama.feed_forward_length': 28672,
    'general.architecture': 'llama',
    'general.name': 'Test Llama 70B',
    'general.quantization_version': 2,
  },

  // Mistral configuration
  mistral7B: {
    'mistral.block_count': 32,
    'mistral.attention.head_count_kv': 8,
    'mistral.embedding_length': 4096,
    'mistral.context_length': 32768,
    'mistral.feed_forward_length': 14336,
    'general.architecture': 'mistral',
    'general.name': 'Test Mistral 7B',
    'general.quantization_version': 2,
  },

  // Minimal valid configuration
  minimal: {
    'llama.block_count': 1,
    'llama.attention.head_count_kv': 1,
    'llama.embedding_length': 128,
    'llama.context_length': 512,
    'llama.feed_forward_length': 256,
  },

  // Configuration with missing fields
  incomplete: {
    'llama.block_count': 32,
    // Missing other fields to test error handling
  },
};

// Expected parsed metadata for test configs
export const expectedMetadata: Record<string, Partial<GGUFMetadata>> = {
  llama7B: {
    n_layers: 32,
    n_kv_heads: 8,
    embedding_dim: 4096,
    context_length: 32768,
    feed_forward_dim: 11008,
    model_size_mb: 7000, // Will be set by test
    loaded: true,
  },

  llama13B: {
    n_layers: 40,
    n_kv_heads: 40,
    embedding_dim: 5120,
    context_length: 32768,
    feed_forward_dim: 13824,
    model_size_mb: 13000,
    loaded: true,
  },

  llama70B: {
    n_layers: 80,
    n_kv_heads: 8,
    embedding_dim: 8192,
    context_length: 32768,
    feed_forward_dim: 28672,
    model_size_mb: 70000,
    loaded: true,
  },

  minimal: {
    n_layers: 1,
    n_kv_heads: 1,
    embedding_dim: 128,
    context_length: 512,
    feed_forward_dim: 256,
    model_size_mb: 100,
    loaded: true,
  },
};

// Test cases for edge cases and errors
export const edgeCaseBuffers = {
  // Empty buffer
  empty: Buffer.alloc(0),

  // Buffer with only magic number
  onlyMagic: Buffer.from('GGUF'),

  // Buffer with invalid magic number - need at least 4 bytes for magic
  invalidMagic: (() => {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0x58585858, 0); // "XXXX" in little-endian
    buf.writeUInt32LE(0, 4); // Version
    return buf;
  })(),

  // Buffer with unsupported version
  unsupportedVersion: (() => {
    const buf = createGGUFHeader();
    buf.writeUInt32LE(1, 4); // Version 1 is unsupported
    return buf;
  })(),

  // Buffer that's too small for metadata
  tooSmall: createGGUFHeader().subarray(0, 20),

  // Buffer with corrupted metadata
  corrupted: (() => {
    const buf = createCompleteGGUFBuffer(testModelConfigs.minimal);
    // Corrupt some bytes in the middle
    buf[30] = 0xff;
    buf[31] = 0xff;
    buf[32] = 0xff;
    return buf;
  })(),

  // Very large key-value count that would overflow
  overflow: (() => {
    const buf = createGGUFHeader();
    // Set an impossibly large key-value count
    buf.writeBigUInt64LE(BigInt(Number.MAX_SAFE_INTEGER), 16);
    return buf;
  })(),
};

// Expected VRAM estimates for different configurations
// Updated based on actual calculation results
export const expectedVRAMEstimates = {
  llama7B_2k: { expected: 8407, conservative: 8984 },
  llama7B_4k: { expected: 8679, conservative: 9256 },
  llama7B_8k: { expected: 9224, conservative: 9801 },
  llama7B_16k: { expected: 10312, conservative: 10889 },

  llama13B_2k: { expected: 15785, conservative: 16362 },
  llama13B_4k: { expected: 16329, conservative: 16906 },
  llama13B_8k: { expected: 17417, conservative: 17994 },

  llama70B_2k: { expected: 47123, conservative: 47700 },
  llama70B_4k: { expected: 47667, conservative: 48244 },
  llama70B_8k: { expected: 48755, conservative: 49332 },
};

// Mock file system data for integration tests
export const mockFileSystemData = {
  modelsDir: '/test/models',
  modelFiles: [
    {
      name: 'llama-7b-q4.gguf',
      path: '/test/models/llama-7b-q4.gguf',
      size: 7000000000, // 7GB
      metadata: testModelConfigs.llama7B,
    },
    {
      name: 'llama-13b-q4.gguf',
      path: '/test/models/llama-13b-q4.gguf',
      size: 13000000000, // 13GB
      metadata: testModelConfigs.llama13B,
    },
    {
      name: 'mistral-7b-q5.gguf',
      path: '/test/models/mistral-7b-q5.gguf',
      size: 7500000000, // 7.5GB
      metadata: testModelConfigs.mistral7B,
    },
  ],
};
