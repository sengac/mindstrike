interface LlmConfig {
  baseURL: string;
  model: string;
  apiKey?: string;
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const response = await fetch('/api/llm-config');
  if (!response.ok) {
    throw new Error('Failed to fetch LLM configuration');
  }
  return response.json();
}

export async function updateLlmConfig(config: Partial<LlmConfig>): Promise<LlmConfig> {
  const response = await fetch('/api/llm-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update LLM configuration');
  }
  
  const result = await response.json();
  return result.config;
}
