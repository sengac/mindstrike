import { useEffect } from 'react';
import { usePreferences } from './usePreferences';
import { updateLlmConfig, getLlmConfig } from '../api/llmConfig';

export function useLlmConfig() {
  const { llmConfig, setLlmConfig } = usePreferences();

  // Sync preferences to backend when they change
  useEffect(() => {
    updateLlmConfig(llmConfig).catch(console.error);
  }, [llmConfig]);

  // Load config from backend on mount to sync with any server-side defaults
  useEffect(() => {
    getLlmConfig()
      .then(serverConfig => {
        // Only update if there's a meaningful difference
        if (
          serverConfig.baseURL !== llmConfig.baseURL ||
          serverConfig.model !== llmConfig.model ||
          serverConfig.apiKey !== llmConfig.apiKey
        ) {
          setLlmConfig(serverConfig);
        }
      })
      .catch(console.error);
  }, []);

  return {
    llmConfig,
    setLlmConfig,
  };
}
