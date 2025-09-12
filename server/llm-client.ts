export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url' | 'image';
    text?: string;
    image_url?: {
      url: string;
    };
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
  images?: string[]; // For Ollama vision models - array of base64 strings
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
  displayName?: string;
  apiKey?: string;
  type?: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'local';
  debug?: boolean;
}

export class LLMClient {
  private config: LLMConfig;
  private localLLMManager?: any; // Import LocalLLMManager when needed

  constructor(config: LLMConfig) {
    this.config = config;
  }

  private async getLocalLLMManager() {
    if (!this.localLLMManager) {
      const { getLocalLLMManager } = await import('./local-llm-singleton.js');
      this.localLLMManager = getLocalLLMManager();
    }
    return this.localLLMManager;
  }

  async generateResponse(
    messages: LLMMessage[],
    tools?: any[],
    stream = false
  ): Promise<LLMResponse> {
    if (!this.config.model || this.config.model.trim() === '') {
      throw new Error('No LLM model configured. Please select a model from the available options.');
    }

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
      if (this.config.type === 'anthropic') {
        headers['x-api-key'] = this.config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
    }

    try {
      // Determine service type
      const isOllama = this.config.type === 'ollama' || this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
      const isAnthropic = this.config.type === 'anthropic';
      const isLocal = this.config.type === 'local';

      // Handle local models directly without HTTP requests
      if (isLocal) {
        const localManager = await this.getLocalLLMManager();
        
        // Convert LLMMessage format to simple array for local manager
        const localMessages = messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        }));

        try {
          const response = await localManager.generateResponse(this.config.model, localMessages, {
            temperature: 0.7,
            maxTokens: 2048
          });

          return {
            content: response,
            toolCalls: undefined // Local models don't support tool calls yet
          };
        } catch (error) {
          if (error instanceof Error && error.message === 'Model not loaded. Please load the model first.') {
            // Throw a more specific error that the frontend can catch
            const customError = new Error('LOCAL_MODEL_NOT_LOADED');
            (customError as any).modelId = this.config.model;
            (customError as any).originalMessage = error.message;
            throw customError;
          }
          throw error;
        }
      }
      
      // Check if this is a vision request (has images)
      const hasImages = messages.some(msg => msg.images && msg.images.length > 0);
      
      let endpoint: string;
      let requestPayload: any;
      
      if (isOllama && hasImages) {
        // For Ollama vision models with multiple images, handle separately
        const userMsgWithImages = messages.find(msg => msg.images && msg.images.length > 0);
        const systemMsg = messages.find(msg => msg.role === 'system');
        
        if (userMsgWithImages && userMsgWithImages.images && userMsgWithImages.images.length > 1) {
          // Multiple images - send separate requests and combine responses
          return await this.handleMultipleImages(userMsgWithImages, systemMsg);
        } else {
          // Single image - use normal flow
          endpoint = '/api/generate';
          
          // Combine system prompt and user message
          let prompt = '';
          if (systemMsg) {
            prompt += systemMsg.content + '\n\n';
          }
          prompt += userMsgWithImages?.content || '';
          
          requestPayload = {
            model: this.config.model,
            prompt: prompt,
            stream: false,
            images: userMsgWithImages?.images || []
          };
        }
      } else if (isOllama) {
        // Regular Ollama text-only
        endpoint = '/api/chat';
        requestPayload = {
          model: this.config.model,
          messages,
          stream: false,
          options: tools ? { tools } : undefined
        };
      } else if (isAnthropic) {
        // Anthropic format
        endpoint = '/v1/messages';
        
        // Anthropic uses different request format
        const systemMessage = messages.find(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        
        requestPayload = {
          model: this.config.model,
          max_tokens: 4096,
          messages: nonSystemMessages
        };
        
        if (systemMessage) {
          requestPayload.system = systemMessage.content;
        }
      } else {
        // OpenAI format
        endpoint = '/v1/chat/completions';
        requestPayload = requestBody;
      }

      // Log image requests (debug mode only)
      if (hasImages && this.config.debug) {
        console.log('🖼️ IMAGE REQUEST to LLM:');
        console.log('URL:', `${this.config.baseURL}${endpoint}`);
        console.log('Payload:', JSON.stringify(requestPayload, null, 2));
      }

      const response = await fetch(`${this.config.baseURL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        let errorMessage = `LLM API error: ${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.text();
          console.error('LLM API error details:', errorBody);
          errorMessage += ` - ${errorBody}`;
        } catch (e) {
          // Ignore error parsing error body
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Log image responses (debug mode only)
      if (hasImages && this.config.debug) {
        console.log('🖼️ IMAGE RESPONSE from LLM:');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
      }
      
      // Handle different response formats
      let content = '';
      let toolCalls: ToolCall[] | undefined;
      
      if (isOllama && hasImages) {
        // Ollama /api/generate response format
        content = data.response || '';
      } else if (isOllama) {
        // Ollama /api/chat response format
        content = data.message?.content || '';
        // Ollama doesn't support function calling in the same way, so we'll skip tools for now
      } else if (isAnthropic) {
        // Anthropic response format
        content = data.content?.[0]?.text || '';
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
    if (!this.config.model || this.config.model.trim() === '') {
      throw new Error('No LLM model configured. Please select a model from the available options.');
    }

    const isOllama = this.config.type === 'ollama' || this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
    const isAnthropic = this.config.type === 'anthropic';
    const isLocal = this.config.type === 'local';

    // Handle local models directly for streaming
    if (isLocal) {
      const localManager = await this.getLocalLLMManager();
      
      // Convert LLMMessage format to simple array for local manager
      const localMessages = messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }));

      // Use the streaming generator from local manager
      yield* localManager.generateStreamResponse(this.config.model, localMessages, {
        temperature: 0.7,
        maxTokens: 2048
      });
      return;
    }
    
    let endpoint: string;
    if (isOllama) {
      endpoint = '/api/chat';
    } else if (isAnthropic) {
      endpoint = '/v1/messages';
    } else {
      endpoint = '/v1/chat/completions';
    }
    
    let requestBody: any;
    if (isOllama) {
      requestBody = {
        model: this.config.model,
        messages,
        stream: true,
        options: tools ? { tools } : undefined
      };
    } else if (isAnthropic) {
      const systemMessage = messages.find(m => m.role === 'system');
      const nonSystemMessages = messages.filter(m => m.role !== 'system');
      
      requestBody = {
        model: this.config.model,
        max_tokens: 4096,
        messages: nonSystemMessages,
        stream: true
      };
      
      if (systemMessage) {
        requestBody.system = systemMessage.content;
      }
    } else {
      requestBody = {
        model: this.config.model,
        messages,
        stream: true,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      if (this.config.type === 'anthropic') {
        headers['x-api-key'] = this.config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
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
              const isOllama = this.config.type === 'ollama' || this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
              const isAnthropic = this.config.type === 'anthropic';
              
              let delta = '';
              if (isOllama) {
                // Ollama streaming format
                delta = parsed.message?.content || '';
              } else if (isAnthropic) {
                // Anthropic streaming format
                delta = parsed.delta?.text || '';
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
              const isOllama = this.config.type === 'ollama' || this.config.baseURL.includes('11434') || this.config.baseURL.includes('ollama');
              const isAnthropic = this.config.type === 'anthropic';
              
              if (isOllama && parsed.message?.content) {
                yield parsed.message.content;
              } else if (isAnthropic && parsed.delta?.text) {
                yield parsed.delta.text;
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

  private async handleMultipleImages(userMsgWithImages: LLMMessage, systemMsg?: LLMMessage): Promise<LLMResponse> {
    const images = userMsgWithImages.images || [];
    const responses: string[] = [];
    
    // Combine system prompt and user message
    let basePrompt = '';
    if (systemMsg) {
      basePrompt += systemMsg.content + '\n\n';
    }
    basePrompt += userMsgWithImages.content;
    
    // Send separate request for each image
    for (let i = 0; i < images.length; i++) {
      const imagePrompt = `${basePrompt}\n\n[Analyzing image ${i + 1} of ${images.length}]`;
      
      const requestPayload = {
        model: this.config.model,
        prompt: imagePrompt,
        stream: false,
        images: [images[i]] // Single image per request
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.apiKey) {
        if (this.config.type === 'anthropic') {
          headers['x-api-key'] = this.config.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
      }

      try {
        if (this.config.debug) {
          console.log(`🖼️ IMAGE REQUEST ${i + 1}/${images.length} to LLM:`);
          console.log('URL:', `${this.config.baseURL}/api/generate`);
          console.log('Payload:', JSON.stringify(requestPayload, null, 2));
        }
        
        const response = await fetch(`${this.config.baseURL}/api/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          let errorMessage = `LLM API error for image ${i + 1}: ${response.status} ${response.statusText}`;
          try {
            const errorBody = await response.text();
            console.error(`LLM API error details for image ${i + 1}:`, errorBody);
            errorMessage += ` - ${errorBody}`;
          } catch (e) {
            // Ignore error parsing error body
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        
        if (this.config.debug) {
          console.log(`🖼️ IMAGE RESPONSE ${i + 1}/${images.length} from LLM:`);
          console.log('Status:', response.status);
          console.log('Response:', JSON.stringify(data, null, 2));
        }
        
        const content = data.response || '';
        responses.push(`**Image ${i + 1} Analysis:**\n${content}`);
        
      } catch (error) {
        console.error(`Error processing image ${i + 1}:`, error);
        responses.push(`**Image ${i + 1} Analysis:**\nError analyzing this image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Combine all responses
    const combinedContent = `I've analyzed ${images.length} images. Here are my findings:\n\n${responses.join('\n\n---\n\n')}`;
    
    return {
      content: combinedContent,
      toolCalls: undefined
    };
  }
}
