import { useState, useEffect } from 'react';

interface AppPreferences {
  fontSize: number;
  workspaceRoot?: string;
  llmConfig: {
    baseURL: string;
    model: string;
    apiKey?: string;
  };
}

const defaultPreferences: AppPreferences = {
  fontSize: 14,
  workspaceRoot: undefined,
  llmConfig: {
    baseURL: 'http://localhost:11434',
    model: 'devstral:latest',
    apiKey: undefined,
  },
};

const PREFERENCES_KEY = 'mindstrike-preferences';

export function usePreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences({ ...defaultPreferences, ...parsed });
      }
    } catch (error) {
      console.warn('Failed to load preferences from localStorage:', error);
    }
  }, []);

  // Save preferences to localStorage whenever they change
  const updatePreferences = (updates: Partial<AppPreferences>) => {
    const newPreferences = { ...preferences, ...updates };
    setPreferences(newPreferences);
    
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPreferences));
    } catch (error) {
      console.warn('Failed to save preferences to localStorage:', error);
    }
  };

  return {
    preferences,
    updatePreferences,
    fontSize: preferences.fontSize,
    setFontSize: (fontSize: number) => updatePreferences({ fontSize }),
    workspaceRoot: preferences.workspaceRoot,
    setWorkspaceRoot: (workspaceRoot: string) => updatePreferences({ workspaceRoot }),
    llmConfig: preferences.llmConfig,
    setLlmConfig: (llmConfig: Partial<AppPreferences['llmConfig']>) => 
      updatePreferences({ llmConfig: { ...preferences.llmConfig, ...llmConfig } }),
  };
}
