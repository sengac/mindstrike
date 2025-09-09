import { useState, useEffect } from 'react';

interface AppPreferences {
  fontSize: number;
  currentDirectory?: string;
}

const defaultPreferences: AppPreferences = {
  fontSize: 14,
  currentDirectory: undefined,
};

const PREFERENCES_KEY = 'poweragent-preferences';

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
    currentDirectory: preferences.currentDirectory,
    setCurrentDirectory: (currentDirectory: string) => updatePreferences({ currentDirectory }),
  };
}
