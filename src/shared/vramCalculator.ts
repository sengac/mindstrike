/**
 * Shared VRAM Calculator
 * This module contains VRAM calculation logic that can be used by both frontend and backend
 *
 * For backend: Uses node-llama-cpp's GgufInsights for accurate memory estimation
 * For frontend: Falls back to formula-based estimation
 */

// Import logger - works in both frontend and backend
import { logger } from '../utils/logger';

export type CacheType = 'fp16' | 'q8_0' | 'q4_0';

export interface VRAMEstimate {
  expected: number;
  conservative: number;
}

export interface VRAMConfiguration {
  gpuLayers: number;
  contextSize: number;
  cacheType: CacheType;
  label: string;
}

export interface VRAMEstimateInfo extends VRAMEstimate {
  config: VRAMConfiguration;
}

// Type definition for GgufInsights-like object
interface GgufInsightsLike {
  totalLayers: number;
  trainContextSize?: number;
  flashAttentionSupported: boolean;
  estimateModelResourceRequirements: (params: {
    gpuLayers: number;
    useMmap?: boolean;
    gpuSupportsMmap?: boolean;
  }) => {
    cpuRam: number;
    gpuVram: number;
  };
  estimateContextResourceRequirements: (params: {
    contextSize: number;
    modelGpuLayers: number;
    batchSize?: number;
    sequences?: number;
    isEmbeddingContext?: boolean;
    includeGraphOverhead?: boolean;
    flashAttention?: boolean;
    swaFullCache?: boolean;
  }) => {
    cpuRam: number;
    gpuVram: number;
  };
}

export interface ModelArchitectureInfo {
  layers?: number;
  kvHeads?: number;
  embeddingDim?: number;
  contextLength?: number;
  feedForwardDim?: number;
  modelSizeMB?: number;
  // Optional: GgufInsights instance for accurate calculations
  ggufInsights?: GgufInsightsLike;
}

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

/**
 * Fallback formula-based VRAM estimation (used when GgufInsights not available)
 * Formula source: https://oobabooga.github.io/blog/posts/gguf-vram-formula/
 */
const estimateVRAMFallback = (
  architecture: ModelArchitectureInfo,
  gpuLayers: number,
  ctxSize: number,
  cacheType: CacheType
): number => {
  // Extract required values
  const nLayers = architecture.layers;
  const nKvHeads = architecture.kvHeads;
  const embeddingDim = architecture.embeddingDim;
  const sizeInMb = architecture.modelSizeMB ?? 0;

  // Validate required fields
  if (
    nLayers === undefined ||
    nKvHeads === undefined ||
    embeddingDim === undefined
  ) {
    throw new Error(
      'Missing required architecture fields for VRAM calculation'
    );
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

/**
 * Estimate VRAM usage for a model configuration
 * Uses GgufInsights if available for accurate estimation, otherwise falls back to formula
 */
export const estimateVRAM = (
  architecture: ModelArchitectureInfo,
  gpuLayers: number,
  ctxSize: number,
  cacheType: CacheType,
  batchSize: number = 512
): number => {
  // If GgufInsights is available, use it for accurate estimation
  if (architecture.ggufInsights) {
    try {
      const insights = architecture.ggufInsights;

      // Ensure GPU layers doesn't exceed total layers
      const actualGpuLayers = Math.min(
        gpuLayers,
        insights.totalLayers || gpuLayers
      );

      // Get model loading requirements
      const modelRequirements = insights.estimateModelResourceRequirements({
        gpuLayers: actualGpuLayers,
        useMmap: true,
        gpuSupportsMmap: true,
      });

      // Get context requirements
      const contextRequirements = insights.estimateContextResourceRequirements({
        contextSize: ctxSize,
        modelGpuLayers: actualGpuLayers,
        batchSize: batchSize,
        sequences: 1,
        isEmbeddingContext: false,
        includeGraphOverhead: true,
        flashAttention: insights.flashAttentionSupported,
        swaFullCache: false,
      });

      // Total VRAM in MB (GgufInsights returns bytes)
      const totalVramBytes =
        modelRequirements.gpuVram + contextRequirements.gpuVram;
      return totalVramBytes / (1024 * 1024); // Convert to MB
    } catch (error) {
      logger.debug(
        'GgufInsights calculation failed, falling back to formula:',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // Fall through to formula-based calculation
    }
  }

  // Fallback to formula-based estimation
  return estimateVRAMFallback(architecture, gpuLayers, ctxSize, cacheType);
};

/**
 * Calculate VRAM estimate with conservative margin
 */
export const calculateVRAMEstimate = (
  architecture: ModelArchitectureInfo,
  gpuLayers: number,
  ctxSize: number,
  cacheType: CacheType,
  batchSize: number = 512
): VRAMEstimate => {
  const expected = estimateVRAM(
    architecture,
    gpuLayers,
    ctxSize,
    cacheType,
    batchSize
  );

  // Use proportional margin when using GgufInsights (more accurate)
  // Use fixed margin for fallback formula
  const margin = architecture.ggufInsights
    ? expected * 0.1 // 10% margin for GgufInsights (already includes overhead)
    : 577; // Fixed margin for formula (less accurate)

  const conservative = expected + margin;

  return {
    expected: Math.round(expected),
    conservative: Math.round(conservative),
  };
};

/**
 * Generate VRAM configurations based on max context
 */
export const generateVRAMConfigurations = (
  maxContext: number
): VRAMConfiguration[] => {
  // Always generate exactly 4 configurations as quarters of the maximum context
  const configs: VRAMConfiguration[] = [];

  if (maxContext <= 1000) {
    // For very small contexts, use smaller steps
    const step = Math.floor(maxContext / 4);
    for (let i = 1; i <= 4; i++) {
      const contextSize = Math.min(step * i, maxContext);
      configs.push({
        gpuLayers: 999,
        contextSize,
        cacheType: 'fp16',
        label: `${contextSize} tokens`,
      });
    }
  } else {
    // Standard quarters for larger contexts
    const quarters = [0.25, 0.5, 0.75, 1.0];
    for (const fraction of quarters) {
      const contextSize = Math.round(maxContext * fraction);
      // Format label with appropriate precision
      const kValue = contextSize / 1000;
      let label: string;
      if (kValue >= 100) {
        // For large values, round to nearest integer
        label = `${Math.round(kValue)}K context`;
      } else if (kValue >= 10) {
        // For medium values, one decimal if needed
        label =
          kValue % 1 === 0
            ? `${kValue}K context`
            : `${kValue.toFixed(1)}K context`;
      } else {
        // For small values, show decimal only if needed
        label =
          kValue % 1 === 0
            ? `${Math.round(kValue)}K context`
            : `${kValue.toFixed(1)}K context`;
      }
      configs.push({
        gpuLayers: 999,
        contextSize,
        cacheType: 'fp16',
        label,
      });
    }
  }

  // Ensure we always return exactly 4 configs
  return configs.slice(0, 4);
};

/**
 * Calculate all VRAM estimates for a model
 */
export const calculateAllVRAMEstimates = (
  architecture: ModelArchitectureInfo,
  maxContext?: number,
  batchSize: number = 512
): VRAMEstimateInfo[] => {
  // Use provided max context or model's training context
  const contextToUse = maxContext ?? architecture.contextLength ?? 8192;

  const configurations = generateVRAMConfigurations(contextToUse);
  const estimates: VRAMEstimateInfo[] = [];

  for (const config of configurations) {
    try {
      const estimate = calculateVRAMEstimate(
        architecture,
        config.gpuLayers,
        config.contextSize,
        config.cacheType,
        batchSize
      );
      estimates.push({
        ...estimate,
        config,
      });
    } catch (error) {
      logger.debug(`Could not calculate VRAM for config ${config.label}:`, {
        error: error instanceof Error ? error.message : String(error),
        config: config.label,
      });
    }
  }

  return estimates;
};

/**
 * Calculate VRAM usage for specific model settings
 */
export const calculateSettingsVRAM = (
  architecture: ModelArchitectureInfo,
  settings: {
    gpuLayers: number;
    contextSize: number;
    batchSize: number;
  }
): number => {
  // Validate inputs
  if (architecture.ggufInsights) {
    // Use GgufInsights for accurate calculation
    const insights = architecture.ggufInsights;
    const actualGpuLayers =
      settings.gpuLayers === -1
        ? insights.totalLayers
        : Math.min(settings.gpuLayers, insights.totalLayers);

    if (actualGpuLayers <= 0) {
      return 0;
    }

    try {
      // Get model loading requirements
      const modelRequirements = insights.estimateModelResourceRequirements({
        gpuLayers: actualGpuLayers,
        useMmap: true,
        gpuSupportsMmap: true,
      });

      // Get context requirements
      const contextRequirements = insights.estimateContextResourceRequirements({
        contextSize: settings.contextSize,
        modelGpuLayers: actualGpuLayers,
        batchSize: settings.batchSize,
        sequences: 1,
        isEmbeddingContext: false,
        includeGraphOverhead: true,
        flashAttention: insights.flashAttentionSupported,
        swaFullCache: false,
      });

      // Total VRAM in MB
      const totalVramBytes =
        modelRequirements.gpuVram + contextRequirements.gpuVram;
      return totalVramBytes / (1024 * 1024);
    } catch (error) {
      logger.debug('GgufInsights settings calculation failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to formula-based calculation
  if (
    !architecture.layers ||
    !architecture.kvHeads ||
    !architecture.embeddingDim
  ) {
    return 0;
  }

  // Use actual GPU layers (0 means CPU only, -1 means auto/all)
  const actualGpuLayers =
    settings.gpuLayers === -1
      ? architecture.layers
      : Math.min(settings.gpuLayers, architecture.layers);

  // If no GPU layers, no VRAM usage
  if (actualGpuLayers <= 0) {
    return 0;
  }

  // Calculate base VRAM for the model (using fp16 cache as default)
  const baseVram = estimateVRAMFallback(
    architecture,
    actualGpuLayers,
    settings.contextSize,
    'fp16'
  );

  // Add batch size overhead (approximately 10-20% of context VRAM per batch)
  // This is a rough estimate as batch processing adds memory overhead
  const batchOverhead =
    (baseVram * 0.15 * Math.log2(settings.batchSize + 1)) / Math.log2(512 + 1);

  return baseVram + batchOverhead;
};

/**
 * Get recommended settings based on available VRAM
 */
export const getRecommendedSettings = (
  architecture: ModelArchitectureInfo,
  availableVramMB: number,
  preset: 'conservative' | 'balanced' | 'performance' = 'balanced'
): {
  gpuLayers: number;
  contextSize: number;
  batchSize: number;
  estimatedVram: number;
} => {
  // Target usage percentages for each preset
  const targetUsage = {
    conservative: 0.5,
    balanced: 0.7,
    performance: 0.9,
  };

  const targetVram = availableVramMB * targetUsage[preset];

  // Start with full GPU layers and reduce if needed
  let gpuLayers =
    architecture.ggufInsights?.totalLayers ?? architecture.layers ?? 32;
  let contextSize = Math.min(
    architecture.ggufInsights?.trainContextSize ??
      architecture.contextLength ??
      8000,
    8000
  );
  let batchSize = 512;

  // Try to fit within target VRAM
  let estimatedVram = calculateSettingsVRAM(architecture, {
    gpuLayers,
    contextSize,
    batchSize,
  });

  // Reduce settings if over target
  while (estimatedVram > targetVram && (gpuLayers > 1 || contextSize > 512)) {
    if (contextSize > 2000) {
      // First reduce context size
      contextSize = Math.max(512, contextSize - 1000);
    } else if (batchSize > 128) {
      // Then reduce batch size
      batchSize = Math.max(128, batchSize / 2);
    } else if (gpuLayers > 1) {
      // Finally reduce GPU layers
      gpuLayers = Math.max(1, Math.floor(gpuLayers * 0.8));
    } else {
      // Can't reduce further
      break;
    }

    estimatedVram = calculateSettingsVRAM(architecture, {
      gpuLayers,
      contextSize,
      batchSize,
    });
  }

  return {
    gpuLayers,
    contextSize: Math.round(contextSize / 100) * 100, // Round to nearest 100
    batchSize: Math.round(batchSize),
    estimatedVram,
  };
};
