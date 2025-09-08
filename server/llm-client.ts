export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface LLMConfig {
  baseURL: string;
  model: string;
  apiKey?: string;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async generateResponse(
    messages: LLMMessage[],
    tools?: any[],
    stream = false
  ): Promise<LLMResponse> {
    const requestBody: any = {
      model: this.config.model,
      messages,
      stream
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      // Use Ollama's native API endpoint
      const isOllama = this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
      const endpoint = isOllama ? '/api/chat' : '/v1/chat/completions';
      
      // Transform request for Ollama format
      const requestPayload = isOllama ? {
        model: this.config.model,
        messages,
        stream: false,
        options: tools ? { tools } : undefined
      } : requestBody;

      const response = await fetch(`${this.config.baseURL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle Ollama response format vs OpenAI format
      
      let content = '';
      let toolCalls: ToolCall[] | undefined;
      
      if (isOllama) {
        // Ollama format
        content = data.message?.content || '';
        // Ollama doesn't support function calling in the same way, so we'll skip tools for now
      } else {
        // OpenAI format
        const choice = data.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }
        content = choice.message.content || '';
        
        // Parse tool calls if present
        if (choice.message.tool_calls) {
          toolCalls = choice.message.tool_calls.map((toolCall: any) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            parameters: JSON.parse(toolCall.function.arguments)
          }));
        }
      }

      const result: LLMResponse = {
        content,
        toolCalls
      };

      return result;
    } catch (error) {
      console.error('LLM request failed:', error);
      throw error;
    }
  }

  async *generateStreamResponse(
    messages: LLMMessage[],
    tools?: any[]
  ): AsyncGenerator<string> {
    const isOllama = this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
    const endpoint = isOllama ? '/api/chat' : '/v1/chat/completions';
    
    const requestBody: any = isOllama ? {
      model: this.config.model,
      messages,
      stream: true,
      options: tools ? { tools } : undefined
    } : {
      model: this.config.model,
      messages,
      stream: true,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? 'auto' : undefined
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseURL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const isOllama = this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
              
              let delta = '';
              if (isOllama) {
                // Ollama streaming format
                delta = parsed.message?.content || '';
              } else {
                // OpenAI streaming format
                delta = parsed.choices?.[0]?.delta?.content || '';
              }
              
              if (delta) {
                yield delta;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          } else if (line.trim()) {
            // Handle non-SSE format (plain JSON lines)
            try {
              const parsed = JSON.parse(line);
              const isOllama = this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
              
              if (isOllama && parsed.message?.content) {
                yield parsed.message.content;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
