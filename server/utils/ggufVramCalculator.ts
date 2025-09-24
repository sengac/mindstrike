/**
 * GGUF VRAM Calculator - TypeScript ES Module
 * Functional implementation for calculating VRAM usage of GGUF models
 */

import { promises as fs } from 'fs';
import { logger } from '../logger';

// Types and Interfaces
export enum GGUFValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export interface GGUFMetadata {
  [key: string]: unknown;
  n_layers?: number;
  n_kv_heads?: number;
  embedding_dim?: number;
  context_length?: number;
  feed_forward_dim?: number;
  url?: string;
  model_name?: string;
  model_size_mb?: number;
  loaded?: boolean;
}

export interface VRAMEstimate {
  expected: number;
  conservative: number;
}

export type CacheType = 'fp16' | 'q8_0' | 'q4_0';

// Constants
const GGUF_MAGIC = 0x46554747; // "GGUF" in little-endian
const MAX_DOWNLOAD_SIZE = 25 * 1024 * 1024; // 25MB

// Utility functions for binary reading
export const readUInt32LE = (buffer: Buffer, offset: number): number => {
  return buffer.readUInt32LE(offset);
};

export const readUInt64LE = (buffer: Buffer, offset: number): bigint => {
  return buffer.readBigUInt64LE(offset);
};

export const readInt8 = (buffer: Buffer, offset: number): number => {
  return buffer.readInt8(offset);
};

export const readUInt8 = (buffer: Buffer, offset: number): number => {
  return buffer.readUInt8(offset);
};

export const readInt16LE = (buffer: Buffer, offset: number): number => {
  return buffer.readInt16LE(offset);
};

export const readUInt16LE = (buffer: Buffer, offset: number): number => {
  return buffer.readUInt16LE(offset);
};

export const readInt32LE = (buffer: Buffer, offset: number): number => {
  return buffer.readInt32LE(offset);
};

export const readFloatLE = (buffer: Buffer, offset: number): number => {
  return buffer.readFloatLE(offset);
};

export const readDoubleLE = (buffer: Buffer, offset: number): number => {
  return buffer.readDoubleLE(offset);
};

export const readBigInt64LE = (buffer: Buffer, offset: number): bigint => {
  return buffer.readBigInt64LE(offset);
};

// Get required bytes for a value type
const getRequiredBytes = (
  valueType: GGUFValueType,
  buffer: Buffer,
  offset: number
): number => {
  switch (valueType) {
    case GGUFValueType.UINT8:
    case GGUFValueType.INT8:
    case GGUFValueType.BOOL:
      return 1;
    case GGUFValueType.UINT16:
    case GGUFValueType.INT16:
      return 2;
    case GGUFValueType.UINT32:
    case GGUFValueType.INT32:
    case GGUFValueType.FLOAT32:
      return 4;
    case GGUFValueType.UINT64:
    case GGUFValueType.INT64:
    case GGUFValueType.FLOAT64:
      return 8;
    case GGUFValueType.STRING: {
      // Need to read the length first
      if (offset + 8 > buffer.length) {
        return buffer.length + 1; // Force error
      }
      const length = Number(readUInt64LE(buffer, offset));
      return 8 + length;
    }
    default:
      return 0;
  }
};

// Read a single value from buffer based on type
export const readSingleValue = (
  buffer: Buffer,
  offset: number,
  valueType: GGUFValueType
): { value: unknown; bytesRead: number } => {
  // Check bounds for each type
  const requiredBytes = getRequiredBytes(valueType, buffer, offset);
  if (offset + requiredBytes > buffer.length) {
    throw new Error(
      `Buffer overflow: need ${requiredBytes} bytes at offset ${offset}, but only ${buffer.length - offset} available`
    );
  }

  switch (valueType) {
    case GGUFValueType.UINT8:
      return { value: readUInt8(buffer, offset), bytesRead: 1 };
    case GGUFValueType.INT8:
      return { value: readInt8(buffer, offset), bytesRead: 1 };
    case GGUFValueType.UINT16:
      return { value: readUInt16LE(buffer, offset), bytesRead: 2 };
    case GGUFValueType.INT16:
      return { value: readInt16LE(buffer, offset), bytesRead: 2 };
    case GGUFValueType.UINT32:
      return { value: readUInt32LE(buffer, offset), bytesRead: 4 };
    case GGUFValueType.INT32:
      return { value: readInt32LE(buffer, offset), bytesRead: 4 };
    case GGUFValueType.FLOAT32:
      return { value: readFloatLE(buffer, offset), bytesRead: 4 };
    case GGUFValueType.UINT64: {
      const value = readUInt64LE(buffer, offset);
      // Convert to number if within safe range
      return {
        value: value <= Number.MAX_SAFE_INTEGER ? Number(value) : value,
        bytesRead: 8,
      };
    }
    case GGUFValueType.INT64: {
      const value = readBigInt64LE(buffer, offset);
      // Convert to number if within safe range
      return {
        value:
          value <= BigInt(Number.MAX_SAFE_INTEGER) &&
          value >= BigInt(Number.MIN_SAFE_INTEGER)
            ? Number(value)
            : value,
        bytesRead: 8,
      };
    }
    case GGUFValueType.FLOAT64:
      return { value: readDoubleLE(buffer, offset), bytesRead: 8 };
    case GGUFValueType.BOOL:
      return { value: readUInt8(buffer, offset) !== 0, bytesRead: 1 };
    case GGUFValueType.STRING: {
      const length = Number(readUInt64LE(buffer, offset));
      const str = buffer.toString('utf8', offset + 8, offset + 8 + length);
      return { value: str, bytesRead: 8 + length };
    }
    default:
      throw new Error(`Unsupported value type: ${valueType}`);
  }
};

// Parse GGUF metadata from buffer
export const parseGGUFMetadata = (buffer: Buffer): GGUFMetadata => {
  let offset = 0;

  // Read and verify magic number
  const magic = readUInt32LE(buffer, offset);
  if (magic !== GGUF_MAGIC) {
    throw new Error(
      `Invalid GGUF file: magic number mismatch (got ${magic.toString(16)})`
    );
  }
  offset += 4;

  // Read version
  const version = readUInt32LE(buffer, offset);
  if (version === 1) {
    throw new Error(
      'You are using an outdated GGUF, please download a new one.'
    );
  }
  offset += 4;

  // Read tensor count (unused but need to skip)
  readUInt64LE(buffer, offset); // Skip tensor count
  offset += 8;

  // Read key-value count
  const kvCount = readUInt64LE(buffer, offset);
  offset += 8;

  const metadata: GGUFMetadata = {};

  // Read key-value pairs
  for (let i = 0; i < kvCount; i++) {
    // Check if we have enough bytes for key length
    if (offset + 8 > buffer.length) {
      break;
    }

    // Read key length and key
    const keyLength = Number(readUInt64LE(buffer, offset));
    offset += 8;

    // Check if we have enough bytes for the key
    if (offset + keyLength > buffer.length) {
      break;
    }

    const key = buffer.toString('utf8', offset, offset + keyLength);
    offset += keyLength;

    // Check if we have enough bytes for value type
    if (offset + 4 > buffer.length) {
      break;
    }

    // Read value type
    const valueType = readUInt32LE(buffer, offset) as GGUFValueType;
    offset += 4;

    try {
      if (valueType === GGUFValueType.ARRAY) {
        // Check if we have enough bytes for array metadata
        if (offset + 12 > buffer.length) {
          break;
        }

        // Read array type and length
        const arrayType = readUInt32LE(buffer, offset) as GGUFValueType;
        offset += 4;

        const arrayLength = Number(readUInt64LE(buffer, offset));
        offset += 8;

        const array: unknown[] = [];
        for (let j = 0; j < arrayLength; j++) {
          // Check if we have enough bytes for the value
          if (offset >= buffer.length) {
            break;
          }

          const { value, bytesRead } = readSingleValue(
            buffer,
            offset,
            arrayType
          );
          array.push(value);
          offset += bytesRead;
        }
        metadata[key] = array;
      } else {
        // Check if we have enough bytes for the value
        if (offset >= buffer.length) {
          break;
        }

        const { value, bytesRead } = readSingleValue(buffer, offset, valueType);
        metadata[key] = value;
        offset += bytesRead;
      }
    } catch {
      // If we can't read a value, skip it and continue
      break;
    }
  }

  // Extract specific fields for VRAM calculation
  extractVRAMFields(metadata);

  return metadata;
};

// Extract fields needed for VRAM calculation
const extractVRAMFields = (metadata: GGUFMetadata): void => {
  for (const [key, value] of Object.entries(metadata)) {
    if (key.endsWith('.block_count')) {
      metadata.n_layers = value as number;
    } else if (key.endsWith('.attention.head_count_kv')) {
      metadata.n_kv_heads = Array.isArray(value)
        ? Math.max(...(value as number[]))
        : (value as number);
    } else if (key.endsWith('.embedding_length')) {
      metadata.embedding_dim = value as number;
    } else if (key.endsWith('.context_length')) {
      metadata.context_length = value as number;
    } else if (key.endsWith('.feed_forward_length')) {
      metadata.feed_forward_dim = value as number;
    }
  }
};

// Normalize HuggingFace URLs
export const normalizeHuggingFaceUrl = (url: string): string => {
  if (!url.includes('huggingface.co')) {
    return url;
  }

  // Remove query parameters
  let baseUrl = url.split('?')[0];

  // Convert blob URL to resolve URL
  if (baseUrl.includes('/blob/')) {
    baseUrl = baseUrl.replace('/blob/', '/resolve/');
  }

  return baseUrl;
};

// Get model size from URL with multi-part support
export const getModelSizeFromUrl = async (
  modelUrl: string
): Promise<number> => {
  try {
    const normalizedUrl = normalizeHuggingFaceUrl(modelUrl);

    // Get size of main file
    const response = await fetch(normalizedUrl, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`Failed to fetch model info: ${response.statusText}`);
    }

    const mainFileSize = parseInt(
      response.headers.get('content-length') ?? '0',
      10
    );
    const filename = normalizedUrl.split('/').pop() ?? '';

    // Check for multipart pattern
    const multipartMatch = filename.match(/(.+)-(\d+)-of-(\d+)\.gguf$/);

    if (multipartMatch) {
      const basePattern = multipartMatch[1];
      const totalParts = parseInt(multipartMatch[3], 10);
      const baseUrl = normalizedUrl.substring(
        0,
        normalizedUrl.lastIndexOf('/') + 1
      );

      let totalSize = 0;

      // Get size of all parts
      for (let partNum = 1; partNum <= totalParts; partNum++) {
        const partFilename = `${basePattern}-${String(partNum).padStart(5, '0')}-of-${String(totalParts).padStart(5, '0')}.gguf`;
        const partUrl = baseUrl + partFilename;

        try {
          const partResponse = await fetch(partUrl, { method: 'HEAD' });
          if (partResponse.ok) {
            const partSize = parseInt(
              partResponse.headers.get('content-length') ?? '0',
              10
            );
            totalSize += partSize;
          } else {
            // Estimate based on average of known parts
            if (totalSize > 0 && partNum > 1) {
              const avgSize = totalSize / (partNum - 1);
              const remainingParts = totalParts - (partNum - 1);
              totalSize += avgSize * remainingParts;
              break;
            } else {
              totalSize = mainFileSize * totalParts;
              break;
            }
          }
        } catch {
          // Fallback estimation
          if (totalSize > 0 && partNum > 1) {
            const avgSize = totalSize / (partNum - 1);
            const remainingParts = totalParts - (partNum - 1);
            totalSize += avgSize * remainingParts;
          } else {
            totalSize = mainFileSize * totalParts;
          }
          break;
        }
      }

      return totalSize / (1024 * 1024); // Convert to MB
    }

    // Single file
    return mainFileSize / (1024 * 1024); // Convert to MB
  } catch {
    // Error getting model size, return 0
    return 0;
  }
};

// Download partial GGUF file
export const downloadGGUFPartial = async (
  url: string,
  maxBytes: number = MAX_DOWNLOAD_SIZE
): Promise<Buffer> => {
  const headers = {
    Range: `bytes=0-${maxBytes - 1}`,
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download GGUF file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

// Load metadata from URL
export const loadMetadataFromUrl = async (
  modelUrl: string
): Promise<GGUFMetadata> => {
  if (!modelUrl || modelUrl.trim() === '') {
    throw new Error('Please enter a model URL');
  }

  logger.debug(`[VRAM] Starting metadata fetch for: ${modelUrl}`);

  // Get model size
  logger.debug(`[VRAM] Getting model size...`);
  const modelSizeMb = await getModelSizeFromUrl(modelUrl);
  logger.debug(`[VRAM] Model size: ${modelSizeMb}MB`);

  // Normalize and download partial file
  const normalizedUrl = normalizeHuggingFaceUrl(modelUrl);
  logger.debug(
    `[VRAM] Downloading GGUF header (up to 25MB) from: ${normalizedUrl}`
  );
  const startTime = Date.now();
  const buffer = await downloadGGUFPartial(normalizedUrl);
  const downloadTime = Date.now() - startTime;
  logger.debug(`[VRAM] Downloaded ${buffer.length} bytes in ${downloadTime}ms`);

  // Parse metadata
  logger.debug(`[VRAM] Parsing GGUF metadata...`);
  const metadata = parseGGUFMetadata(buffer);
  logger.debug(
    `[VRAM] Successfully parsed metadata, context length: ${metadata.context_length}`
  );

  // Extract model name from URL
  let modelName = modelUrl;
  if (modelUrl.includes('huggingface.co/')) {
    try {
      const parts = modelUrl.split('huggingface.co/')[1].split('/');
      if (parts.length >= 2) {
        modelName = `${parts[0]}/${parts[1]}`;
      }
    } catch {
      // Keep original URL as name
    }
  }

  // Add URL and model info
  metadata.url = modelUrl;
  metadata.model_name = modelName;
  metadata.model_size_mb = modelSizeMb;
  metadata.loaded = true;

  return metadata;
};

// Convert cache type to numeric value
const cacheTypeToNumeric = (cacheType: CacheType): number => {
  switch (cacheType) {
    case 'q4_0':
      return 4;
    case 'q8_0':
      return 8;
    case 'fp16':
    default:
      return 16;
  }
};

// Estimate VRAM usage
export const estimateVRAM = (
  metadata: GGUFMetadata,
  gpuLayers: number,
  ctxSize: number,
  cacheType: CacheType
): number => {
  // Extract required values
  const nLayers = metadata.n_layers;
  const nKvHeads = metadata.n_kv_heads;
  const embeddingDim = metadata.embedding_dim;
  const contextLength = metadata.context_length;
  const feedForwardDim = metadata.feed_forward_dim;
  const sizeInMb = metadata.model_size_mb ?? 0;

  // Validate required fields
  if (
    nLayers === undefined ||
    nKvHeads === undefined ||
    embeddingDim === undefined ||
    contextLength === undefined ||
    feedForwardDim === undefined
  ) {
    const missing = [];
    if (nLayers === undefined) {
      missing.push('n_layers');
    }
    if (nKvHeads === undefined) {
      missing.push('n_kv_heads');
    }
    if (embeddingDim === undefined) {
      missing.push('embedding_dim');
    }
    if (contextLength === undefined) {
      missing.push('context_length');
    }
    if (feedForwardDim === undefined) {
      missing.push('feed_forward_dim');
    }
    throw new Error(`Missing required metadata fields: ${missing.join(', ')}`);
  }

  // Ensure GPU layers doesn't exceed total layers
  const actualGpuLayers = Math.min(gpuLayers, nLayers);

  // Convert cache type to numeric
  const cacheTypeNumeric = cacheTypeToNumeric(cacheType);

  // Derived features
  const sizePerLayer = sizeInMb / Math.max(nLayers, 1e-6);
  const kvCacheFactor = nKvHeads * cacheTypeNumeric * ctxSize;
  const embeddingPerContext = embeddingDim / ctxSize;

  // Calculate VRAM using the formula
  // Source: https://oobabooga.github.io/blog/posts/gguf-vram-formula/
  const vram =
    (sizePerLayer - 17.99552795246051 + 3.148552680382576e-5 * kvCacheFactor) *
      (actualGpuLayers +
        Math.max(
          0.9690636483914102,
          cacheTypeNumeric -
            (Math.floor(50.77817218646521 * embeddingPerContext) +
              9.987899908205632)
        )) +
    1516.522943869404;

  return vram;
};

// Calculate VRAM with conservative estimate
export const calculateVRAMEstimate = (
  metadata: GGUFMetadata,
  gpuLayers: number,
  ctxSize: number,
  cacheType: CacheType
): VRAMEstimate => {
  const expected = estimateVRAM(metadata, gpuLayers, ctxSize, cacheType);
  const conservative = expected + 577; // 95% confidence margin

  return {
    expected: Math.round(expected),
    conservative: Math.round(conservative),
  };
};

// Load metadata from a local file
export const loadMetadataFromFile = async (
  filePath: string
): Promise<GGUFMetadata> => {
  // Import path module
  const pathModule = await import('path');

  // Get file stats first to know the actual file size
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  // Read up to 256KB for metadata, but not more than the file size
  const HEADER_SIZE = Math.min(256 * 1024, fileSize); // 256KB or file size, whichever is smaller

  // Open the file and read the first part
  const fd = await fs.open(filePath, 'r');
  try {
    // Create a buffer for the header
    const buffer = Buffer.alloc(HEADER_SIZE);

    // Read from the file
    const { bytesRead } = await fd.read({
      buffer: buffer,
      offset: 0,
      length: HEADER_SIZE,
      position: 0,
    });

    // Use only the bytes that were actually read
    const actualBuffer = buffer.subarray(0, bytesRead);

    // Parse metadata using the same function as URL loading
    const metadata = parseGGUFMetadata(actualBuffer);

    // Calculate model size in MB
    const modelSizeMb = fileSize / (1024 * 1024);

    // Extract model name from filename
    const modelName = pathModule.basename(filePath, '.gguf');

    // Add file info
    metadata.model_name = modelName;
    metadata.model_size_mb = modelSizeMb;
    metadata.loaded = true;

    return metadata;
  } finally {
    await fd.close();
  }
};
