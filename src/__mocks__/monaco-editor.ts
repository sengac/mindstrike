import { vi } from 'vitest';

export const editor = {
  create: vi.fn(() => ({
    dispose: vi.fn(),
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    onDidChangeModelContent: vi.fn(),
    updateOptions: vi.fn(),
    getModel: vi.fn(() => ({
      uri: {},
    })),
  })),
  createModel: vi.fn(() => ({
    dispose: vi.fn(),
  })),
  setModelLanguage: vi.fn(),
  defineTheme: vi.fn(),
  setTheme: vi.fn(),
};

export const languages = {
  typescript: {
    typescriptDefaults: {
      setDiagnosticsOptions: vi.fn(),
      setCompilerOptions: vi.fn(),
    },
  },
};

export const Range = vi.fn();
export const Selection = vi.fn();
