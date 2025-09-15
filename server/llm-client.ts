import { serverDebugLogger } from './debug-logger.js';

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
  contextLength?: number;
  debug?: boolean;
}

export class LLMClient {
  private config: LLMConfig;
  private localLLMManager?: any; // Import LocalLLMManager when needed

  constructor(config: LLMConfig) {
    this.config = config;
  }

  private logResponse(response: LLMResponse, startTime: number, endpoint?: string) {
    const duration = Date.now() - startTime;
    serverDebugLogger.logResponse(
      `LLM Response: ${this.config.model}`,
      JSON.stringify({
        content: response.content, // FULL content - no truncation
        toolCalls: response.toolCalls,
        duration: `${duration}ms`
      }, null, 2),
      duration,
      this.config.model,
      endpoint || this.config.baseURL
    );
  }

  private logError(error: any, startTime: number, endpoint?: string) {
    const duration = Date.now() - startTime;
    serverDebugLogger.logError(
      `LLM Error: ${this.config.model}`,
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`
      }, null, 2),
      this.config.model,
      endpoint || this.config.baseURL
    );
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

    const requestStartTime = Date.now();
    let endpoint: string = '';
    
    // Log the request
    serverDebugLogger.logRequest(
      `LLM Request: ${this.config.model}`,
      JSON.stringify({
        model: this.config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content // FULL content - no truncation
        })),
        tools: tools,
        stream
      }, null, 2),
      this.config.model,
      this.config.baseURL
    );

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
          const maxTokens = Math.min(this.config.contextLength || 2048, 4096);
          console.log(`Local LLM generation: contextLength=${this.config.contextLength}, calculated maxTokens=${maxTokens}`);
          
          const response = await localManager.generateResponse(this.config.model, localMessages, {
            temperature: 0.7,
            maxTokens: maxTokens
          });

          const result = {
            content: response,
            toolCalls: undefined // Local models don't support tool calls yet
          };
          this.logResponse(result, requestStartTime, 'local');
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === 'Model not loaded. Please load the model first.') {
            // Try to load the model automatically
            try {
              console.log(`Auto-loading local model: ${this.config.model}`);
              await localManager.loadModel(this.config.model);
              
              // Retry the generation after loading
              const response = await localManager.generateResponse(this.config.model, localMessages, {
                temperature: 0.7,
                maxTokens: Math.min(this.config.contextLength || 2048, 4096)
              });

              const result = {
                content: response,
                toolCalls: undefined
              };
              this.logResponse(result, requestStartTime, 'local');
              return result;
            } catch (loadError) {
              // If auto-loading fails, fall back to the original error handling
              const customError = new Error('LOCAL_MODEL_NOT_LOADED');
              (customError as any).modelId = this.config.model;
              (customError as any).originalMessage = error.message;
              throw customError;
            }
          }
          throw error;
        }
      }
      
      // Check if this is a vision request (has images)
      const hasImages = messages.some(msg => msg.images && msg.images.length > 0);
      
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

      this.logResponse(result, requestStartTime, this.config.baseURL + (endpoint || ''));
      return result;
    } catch (error) {
      console.error('LLM request failed:', error);
      this.logError(error, requestStartTime, this.config.baseURL + (endpoint || ''));
      throw error;
    }
  }

  async *generateStreamResponse(
    messages: LLMMessage[],
    tools?: any[],
    streamId?: string
  ): AsyncGenerator<string> {
    if (!this.config.model || this.config.model.trim() === '') {
      throw new Error('No LLM model configured. Please select a model from the available options.');
    }

    const requestStartTime = Date.now();
    
    // Log the streaming request
    serverDebugLogger.logRequest(
      `LLM Streaming Request: ${this.config.model}`,
      JSON.stringify({
        model: this.config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        tools: tools,
        stream: true
      }, null, 2),
      this.config.model,
      this.config.baseURL
    );

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
      let fullContent = '';
      try {
        const generator = localManager.generateStreamResponse(this.config.model, localMessages, {
          temperature: 0.7,
          maxTokens: 2048
        });
        
        let tokenCount = 0;
        for await (const chunk of generator) {
          fullContent += chunk;
          tokenCount += Math.max(1, Math.floor(chunk.length / 4)); // Approximate token count
          yield chunk;
        }
        
        // Log successful local streaming response
        const duration = Date.now() - requestStartTime;
        const tokensPerSecond = duration > 0 ? (tokenCount / (duration / 1000)) : 0;
        
        serverDebugLogger.logResponse(
          `Local LLM Streaming Response: ${this.config.model}`,
          JSON.stringify({
            content: fullContent,
            duration: `${duration}ms`,
            streamedChunks: fullContent.length
          }, null, 2),
          duration,
          this.config.model,
          'local',
          tokensPerSecond,
          tokenCount
        );
        return;
      } catch (error) {
        if (error instanceof Error && error.message === 'Model not loaded. Please load the model first.') {
          // Try to load the model automatically
          try {
            console.log(`Auto-loading local model for streaming: ${this.config.model}`);
            await localManager.loadModel(this.config.model);
            
            // Retry the streaming generation after loading
            const retryGenerator = localManager.generateStreamResponse(this.config.model, localMessages, {
              temperature: 0.7,
              maxTokens: 2048
            });
            
            let retryTokenCount = 0;
            for await (const chunk of retryGenerator) {
              fullContent += chunk;
              retryTokenCount += Math.max(1, Math.floor(chunk.length / 4)); // Approximate token count
              yield chunk;
            }
            
            // Log successful retry response
            const duration = Date.now() - requestStartTime;
            const tokensPerSecond = duration > 0 ? (retryTokenCount / (duration / 1000)) : 0;
            
            serverDebugLogger.logResponse(
              `Local LLM Streaming Response (auto-loaded): ${this.config.model}`,
              JSON.stringify({
                content: fullContent,
                duration: `${duration}ms`,
                streamedChunks: fullContent.length
              }, null, 2),
              duration,
              this.config.model,
              'local',
              tokensPerSecond,
              retryTokenCount
            );
            return;
          } catch (loadError) {
            // If auto-loading fails, fall back to the original error handling
            const customError = new Error('LOCAL_MODEL_NOT_LOADED');
            (customError as any).modelId = this.config.model;
            (customError as any).originalMessage = error.message;
            
            // Log the error
            const duration = Date.now() - requestStartTime;
            serverDebugLogger.logError(
              `Local LLM Streaming Error: ${this.config.model}`,
              JSON.stringify({
                error: customError.message,
                duration: `${duration}ms`,
                partialContent: fullContent
              }, null, 2),
              this.config.model,
              'local'
            );
            throw customError;
          }
        }
        
        // Log other streaming errors
        const duration = Date.now() - requestStartTime;
        serverDebugLogger.logError(
          `Local LLM Streaming Error: ${this.config.model}`,
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            duration: `${duration}ms`,
            partialContent: fullContent
          }, null, 2),
          this.config.model,
          'local'
        );
        throw error;
      }
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
    let fullContent = ''; // Collect full response for debug logging
    let tokenCount = 0; // Track tokens generated
    let lastTokenUpdate = Date.now(); // Track when we last sent token update

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
                fullContent += delta; // Collect for debug logging
                tokenCount += Math.max(1, Math.floor(delta.length / 4)); // Approximate token count
                
                // Send token update every 1 second during streaming  
                const now = Date.now();
                if (now - lastTokenUpdate > 1000) {
                  const elapsed = (now - requestStartTime) / 1000;
                  if (elapsed > 0.5 && tokenCount > 0) {
                    const tokensPerSecond = tokenCount / elapsed;
                  serverDebugLogger.logResponse(
                    `LLM Live Update: ${this.config.model}`,
                    '', // Empty content to avoid showing streaming message
                       elapsed * 1000,
                       this.config.model,
                       this.config.baseURL,
                       tokensPerSecond,
                       tokenCount
                     );
                     lastTokenUpdate = now;
                  }
                }
                
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
                const delta = parsed.message.content;
                fullContent += delta; // Collect for debug logging
                tokenCount += Math.max(1, Math.floor(delta.length / 4)); // Approximate token count
                yield delta;
              } else if (isAnthropic && parsed.delta?.text) {
                const delta = parsed.delta.text;
                fullContent += delta; // Collect for debug logging
                tokenCount += Math.max(1, Math.floor(delta.length / 4)); // Approximate token count
                yield delta;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Log the complete streaming response
      if (fullContent) {
        const duration = Date.now() - requestStartTime;
        const tokensPerSecond = duration > 0 ? (tokenCount / (duration / 1000)) : 0;
        
        serverDebugLogger.logResponse(
          `LLM Streaming Response: ${this.config.model}`,
          JSON.stringify({
            content: fullContent,
            duration: `${duration}ms`,
            streamedChunks: fullContent.length // Number of characters streamed
          }, null, 2),
          duration,
          this.config.model,
          this.config.baseURL,
          tokensPerSecond,
          tokenCount
        );
      }
    } catch (error) {
      // Log streaming errors
      const duration = Date.now() - requestStartTime;
      serverDebugLogger.logError(
        `LLM Streaming Error: ${this.config.model}`,
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          duration: `${duration}ms`,
          partialContent: fullContent
        }, null, 2),
        this.config.model,
        this.config.baseURL
      );
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  private async handleMultipleImages(userMsgWithImages: LLMMessage, systemMsg?: LLMMessage): Promise<LLMResponse> {
    const images = userMsgWithImages.images || [];
    const responses: string[] = [];
    const requestStartTime = Date.now();
    
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
    
    const result = {
      content: combinedContent,
      toolCalls: undefined
    };
    
    this.logResponse(result, requestStartTime, `${this.config.baseURL}/api/generate`);
    return result;
  }
}
