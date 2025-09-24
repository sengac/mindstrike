import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatLocalLLM } from './agents/chatLocalLlm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { logger } from './logger';
import { LLMConfigManager } from './llmConfigManager';

export interface DocumentSummary {
  id: string;
  originalId: string;
  summary: string;
  keyPoints: string[];
  contentType: string;
  originalSize: number;
  generatedAt: Date;
  model: string;
}

export interface ProcessedDocument {
  id: string;
  content: string;
  summary: DocumentSummary;
  chunks: DocumentChunk[];
  metadata: {
    originalSize: number;
    processedAt: Date;
    chunkCount: number;
  };
}

export interface DocumentChunk {
  id: string;
  content: string;
  chunkIndex: number;
  metadata: {
    startIndex: number;
    endIndex: number;
    tokens: number;
  };
}

export class DocumentIngestionService {
  private readonly textSplitter: RecursiveCharacterTextSplitter;
  private readonly llmConfigManager: LLMConfigManager;
  private readonly summaryPrompt: PromptTemplate;
  private readonly keyPointsPrompt: PromptTemplate;

  constructor() {
    this.llmConfigManager = new LLMConfigManager();

    // Initialize text splitter with reasonable chunk sizes
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '.', '!', '?', ';', ':', ' ', ''],
    });

    // Summary prompt template
    this.summaryPrompt = PromptTemplate.fromTemplate(`
You are an expert document summarizer. Analyze the following content and provide a comprehensive but concise summary.

Content to summarize:
{content}

Instructions:
- Provide a clear, informative summary in 2-4 sentences
- Focus on the main topics, key information, and important details
- If the content appears to be code, describe what the code does
- If the content is data/logs, describe what the data represents
- Be accurate and preserve important technical details

Summary:`);

    // Key points extraction prompt
    this.keyPointsPrompt = PromptTemplate.fromTemplate(`
Extract the key points from the following content. Return them as a JSON array of strings.

Content:
{content}

Instructions:
- Identify 3-7 key points or main topics
- Each point should be a concise phrase or sentence
- Focus on actionable information, important facts, or main concepts
- If it's code, include key functions/methods/classes
- If it's data, include key metrics or findings
- Return only valid JSON array format

Key Points:`);
  }

  /**
   * Process a document and generate summary with key points
   */
  async processDocument(
    id: string,
    content: string,
    contentType: string = 'text'
  ): Promise<ProcessedDocument> {
    logger.info(
      `[DocumentIngestion] Processing document ${id} (${content.length} characters)`
    );

    try {
      // Create document chunks
      const chunks = await this.createDocumentChunks(id, content);

      // Generate summary
      const summary = await this.generateSummary(id, content, contentType);

      const processedDocument: ProcessedDocument = {
        id,
        content,
        summary,
        chunks,
        metadata: {
          originalSize: content.length,
          processedAt: new Date(),
          chunkCount: chunks.length,
        },
      };

      logger.info(
        `[DocumentIngestion] Successfully processed document ${id} with ${chunks.length} chunks`
      );
      return processedDocument;
    } catch (error) {
      logger.error(
        `[DocumentIngestion] Failed to process document ${id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Generate a summary and key points for content
   */
  private async generateSummary(
    id: string,
    content: string,
    contentType: string
  ): Promise<DocumentSummary> {
    const model = await this.getChatModel();

    try {
      // Generate summary
      const summaryChain = this.summaryPrompt
        .pipe(model)
        .pipe(new StringOutputParser());
      const summary = await summaryChain.invoke({ content });

      // Generate key points
      const keyPointsChain = this.keyPointsPrompt
        .pipe(model)
        .pipe(new StringOutputParser());
      const keyPointsResponse = await keyPointsChain.invoke({ content });

      // Parse key points JSON
      let keyPoints: string[] = [];
      try {
        const parsed: unknown = JSON.parse(keyPointsResponse.trim());
        keyPoints =
          Array.isArray(parsed) &&
          parsed.every(item => typeof item === 'string')
            ? parsed
            : [keyPointsResponse];
      } catch {
        // Fallback: split by lines if JSON parsing fails
        keyPoints = keyPointsResponse
          .split('\n')
          .filter(line => line.trim())
          .map(line => line.replace(/^[-*•]\s*/, '').trim())
          .filter(line => line.length > 0)
          .slice(0, 7);
      }

      return {
        id: `summary_${id}`,
        originalId: id,
        summary: summary.trim(),
        keyPoints,
        contentType,
        originalSize: content.length,
        generatedAt: new Date(),
        model: model.constructor.name,
      };
    } catch (error) {
      logger.error(
        `[DocumentIngestion] Failed to generate summary for ${id}:`,
        error
      );

      // Fallback summary
      return {
        id: `summary_${id}`,
        originalId: id,
        summary: `Large ${contentType} content (${content.length} characters). Unable to generate summary.`,
        keyPoints: [
          `Content type: ${contentType}`,
          `Size: ${content.length} characters`,
        ],
        contentType,
        originalSize: content.length,
        generatedAt: new Date(),
        model: 'fallback',
      };
    }
  }

  /**
   * Create document chunks from content
   */
  private async createDocumentChunks(
    id: string,
    content: string
  ): Promise<DocumentChunk[]> {
    const documents = [new Document({ pageContent: content })];
    const splitDocs = await this.textSplitter.splitDocuments(documents);

    const chunks: DocumentChunk[] = [];
    let currentIndex = 0;

    for (let i = 0; i < splitDocs.length; i++) {
      const doc = splitDocs[i];
      const chunkContent = doc.pageContent;
      const startIndex = currentIndex;
      const endIndex = currentIndex + chunkContent.length;

      chunks.push({
        id: `${id}_chunk_${i}`,
        content: chunkContent,
        chunkIndex: i,
        metadata: {
          startIndex,
          endIndex,
          tokens: this.estimateTokenCount(chunkContent),
        },
      });

      currentIndex = endIndex;
    }

    return chunks;
  }

  /**
   * Get an appropriate chat model for summarization
   */
  private async getChatModel(): Promise<BaseChatModel> {
    // Use the currently selected default model from the frontend
    const defaultModel = await this.llmConfigManager.getDefaultModel();

    if (!defaultModel) {
      throw new Error('No default model configured');
    }

    // Create chat model based on the selected model type
    switch (defaultModel.type) {
      case 'openai':
        return new ChatOpenAI({
          openAIApiKey: defaultModel.apiKey,
          modelName: defaultModel.model,
          temperature: 0.3, // Lower temperature for more focused summaries
          maxTokens: 1000,
        });

      case 'ollama':
        return new ChatOllama({
          baseUrl: defaultModel.baseURL,
          model: defaultModel.model,
          temperature: 0.3,
        });

      case 'local':
        return new ChatLocalLLM({
          modelName: defaultModel.model,
          temperature: 0.3,
          maxTokens: 1000,
        });

      case 'vllm':
      case 'openai-compatible': {
        // Convert relative URLs to full URLs for these models
        const baseURL = defaultModel.baseURL.startsWith('/')
          ? `http://localhost:3001${defaultModel.baseURL}`
          : defaultModel.baseURL;

        return new ChatOpenAI({
          openAIApiKey: defaultModel.apiKey ?? 'not-needed',
          modelName: defaultModel.model,
          temperature: 0.3,
          maxTokens: 1000,
          configuration: {
            baseURL,
          },
        });
      }

      default:
        throw new Error(`Unsupported model type: ${defaultModel.type}`);
    }
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Get content type from content analysis
   */
  static detectContentType(content: string): string {
    const lowerContent = content.toLowerCase();

    // Check for common code patterns
    if (
      lowerContent.includes('function') ||
      lowerContent.includes('class') ||
      lowerContent.includes('import') ||
      lowerContent.includes('export') ||
      lowerContent.includes('<?php') ||
      lowerContent.includes('def ') ||
      lowerContent.includes('public class') ||
      lowerContent.includes('const ')
    ) {
      return 'code';
    }

    // Check for JSON
    if (
      (content.trim().startsWith('{') && content.trim().endsWith('}')) ||
      (content.trim().startsWith('[') && content.trim().endsWith(']'))
    ) {
      try {
        JSON.parse(content) as unknown;
        return 'json';
      } catch {
        // Not valid JSON
      }
    }

    // Check for logs
    if (
      lowerContent.includes('error') ||
      lowerContent.includes('info') ||
      lowerContent.includes('debug') ||
      lowerContent.includes('warn') ||
      lowerContent.includes('timestamp') ||
      lowerContent.includes('level')
    ) {
      return 'logs';
    }

    // Check for HTML
    if (
      lowerContent.includes('<html') ||
      lowerContent.includes('<!doctype') ||
      lowerContent.includes('<body') ||
      lowerContent.includes('<div')
    ) {
      return 'html';
    }

    // Check for Markdown
    if (
      content.includes('# ') ||
      content.includes('## ') ||
      content.includes('```') ||
      content.includes('* ') ||
      content.includes('- ')
    ) {
      return 'markdown';
    }

    return 'text';
  }
}

// Singleton instance
export const documentIngestionService = new DocumentIngestionService();
