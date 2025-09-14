import { BaseAgent, AgentConfig } from './base-agent.js';
import { MindMapData, MindMapNode } from '../../src/utils/mindMapData.js';
import { logger } from '../logger.js';
import * as path from 'path';

const DEFAULT_MINDMAP_ROLE = `You are a specialized mindmap agent designed to work with knowledge structures, mind maps, and interconnected information. You excel at organizing, analyzing, and visualizing complex information hierarchies.`;

export interface MindmapContext {
  mindMapId: string;
  mindMapData: MindMapData;
  selectedNodeId?: string;
  selectedNode?: MindMapNode;
}

export class MindmapAgent extends BaseAgent {
  private currentMindmapContext: MindmapContext | null = null;

  constructor(config: AgentConfig) {
    super(config);
  }

  getDefaultRole(): string {
    return DEFAULT_MINDMAP_ROLE;
  }

  createSystemPrompt(): string {
    const basePrompt = [
      this.createRoleDefinition(),
      '',
      this.createGoalSpecification(),
      '',
      this.createMindmapSpecificCapabilities(),
      '',
      this.createErrorHandling(),
      '',
      this.createOutputRequirements(),
      '',
      this.createStepByStepInstructions()
    ].join('\n');

    // Add mindmap context if available
    if (this.currentMindmapContext) {
      const contextPrompt = this.createMindmapContextPrompt();
      return [basePrompt, '', contextPrompt].join('\n');
    }

    return basePrompt;
  }

  async createSystemPromptWithContext(): Promise<string> {
    const remainingContext = await this.calculateRemainingContext();
    
    const basePrompt = [
      this.createRoleDefinition(),
      '',
      this.createGoalSpecification(),
      '',
      this.createMindmapSpecificCapabilities(),
      '',
      this.createErrorHandling(),
      '',
      this.createOutputRequirementsWithLimit(remainingContext),
      '',
      this.createStepByStepInstructions()
    ].join('\n');

    // Add mindmap context if available
    if (this.currentMindmapContext) {
      const contextPrompt = this.createMindmapContextPrompt(remainingContext);
      return [basePrompt, '', contextPrompt].join('\n');
    }

    return basePrompt;
  }

  private createErrorHandling(): string {
    return [
      "If unclear:",
      "- Return empty changes: {\"changes\": []}",
      "- Do not ask questions, just return JSON"
    ].join('\n');
  }

  private createRoleDefinition(): string {
    return this.config.customRole || DEFAULT_MINDMAP_ROLE;
  }

  private createGoalSpecification(): string {
    return `You modify mindmaps by creating, updating, or deleting nodes. Return ONLY the MINDMAP_CHANGES JSON, no other text.`;
  }

  private createMindmapSpecificCapabilities(): string {
    return [
      "Your capabilities:",
      "- Create new nodes with text, notes, and sources",
      "- Update existing node content",
      "- Delete nodes when requested",
      "- Work with the full mindmap context provided",
      "- Sources must have: id, name, directory, type ('file'|'url'|'document'|'reference')"
    ].join('\n');
  }

  private createStepByStepInstructions(): string {
    return [
      "Process:",
      "1. Read the user's request",
      "2. Decide what nodes to create/update/delete", 
      "3. Return ONLY the MINDMAP_CHANGES JSON"
    ].join('\n');
  }

  private createOutputRequirements(): string {
    return [
      "CRITICAL - Response format:",
      "Return ONLY the MINDMAP_CHANGES JSON. No explanation, no other text.",
      "",
      "MINDMAP_CHANGES:",
      "{",
      '  "changes": [',
      '    {"action": "create", "nodeId": "node-123", "parentId": "parent-id", "text": "Title", "notes": "Notes", "sources": [{"id": "src-123", "name": "Source Name", "directory": "Description", "type": "reference"}]}',
      '  ]',
      "}",
      "",
      "CRITICAL CONSTRAINTS:",
      "- Return ONLY the JSON above, nothing else",
      "- Keep entire response under 2000 characters total",
      "- Use 'create', 'update', or 'delete' for action",
      "- Generate nodeId like: node-" + Date.now() + "-xxx",
      "- Sources need: id, name, directory, type"
    ].join('\n');
  }

  private createOutputRequirementsWithLimit(maxCharacters: number): string {
    return [
      "CRITICAL - Response format:",
      "Return ONLY the MINDMAP_CHANGES JSON. No explanation, no other text.",
      "",
      "MINDMAP_CHANGES:",
      "{",
      '  "changes": [',
      '    {"action": "create", "nodeId": "node-123", "parentId": "parent-id", "text": "Title", "notes": "Notes", "sources": [{"id": "src-123", "name": "Source Name", "directory": "Description", "type": "reference"}]}',
      '  ]',
      "}",
      "",
      "CRITICAL CONSTRAINTS:",
      "- Return ONLY the JSON above, nothing else",
      `- Keep entire response under ${maxCharacters} characters to fit remaining context`,
      "- Use 'create', 'update', or 'delete' for action",
      "- Generate nodeId like: node-" + Date.now() + "-xxx",
      "- Sources need: id, name, directory, type"
    ].join('\n');
  }

  // Mindmap context management
  
  /**
   * Set the current mindmap context for the agent
   */
  async setMindmapContext(mindMapId: string, selectedNodeId?: string): Promise<void> {
    try {
      const mindMapData = await this.loadMindmapData(mindMapId);
      if (!mindMapData) {
        throw new Error(`Mindmap with ID ${mindMapId} not found`);
      }

      const selectedNode = selectedNodeId ? this.findNodeById(mindMapData.root, selectedNodeId) : undefined;

      this.currentMindmapContext = {
        mindMapId,
        mindMapData,
        selectedNodeId,
        selectedNode
      };

      // Update system prompt with new context
      this.systemPrompt = this.createSystemPrompt();
      
      // Update the system message in the current conversation
      const systemMessage = this.conversation.find(msg => msg.role === 'system');
      if (systemMessage) {
        systemMessage.content = this.systemPrompt;
      }

      logger.debug('Mindmap context set:', { mindMapId, selectedNodeId, hasSelectedNode: !!selectedNode });
    } catch (error) {
      logger.error('Failed to set mindmap context:', error);
      throw error;
    }
  }

  /**
   * Load mindmap data from storage
   */
  private async loadMindmapData(mindMapId: string): Promise<MindMapData | null> {
    try {
      const fs = await import('fs/promises');
      const mindMapsPath = path.join(this.config.workspaceRoot, 'mindstrike-mindmaps.json');
      
      const data = await fs.readFile(mindMapsPath, 'utf-8');
      if (!data.trim()) {
        return null;
      }
      
      const mindMaps = JSON.parse(data);
      const mindMap = mindMaps.find((m: any) => m.id === mindMapId);
      
      return mindMap ? mindMap.mindmapData : null;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find a node by ID in the mindmap tree
   */
  private findNodeById(node: MindMapNode, nodeId: string): MindMapNode | undefined {
    if (node.id === nodeId) {
      return node;
    }
    
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeById(child, nodeId);
        if (found) return found;
      }
    }
    
    return undefined;
  }

  /**
   * Create mindmap context prompt
   */
  private createMindmapContextPrompt(maxCharacters?: number): string {
    if (!this.currentMindmapContext) {
      return '';
    }

    const { mindMapData, selectedNode } = this.currentMindmapContext;
    const mindmapStructure = this.serializeMindmapStructure(mindMapData.root);
    
    const contextParts = [
      "=== CURRENT MINDMAP CONTEXT ===",
      `Mindmap ID: ${this.currentMindmapContext.mindMapId}`,
      `Layout: ${mindMapData.root.layout}`,
      "",
      "MINDMAP STRUCTURE:",
      mindmapStructure
    ];

    if (selectedNode) {
      contextParts.push(
        "",
        "=== SELECTED NODE ===",
        `Selected Node ID: ${selectedNode.id}`,
        `Selected Node Text: "${selectedNode.text}"`,
        selectedNode.notes ? `Selected Node Notes: "${selectedNode.notes}"` : "Selected Node Notes: None",
        `Selected Node Children: ${selectedNode.children ? selectedNode.children.length : 0}`,
        selectedNode.sources && selectedNode.sources.length > 0 ? 
          `Selected Node Sources: ${selectedNode.sources.length} source(s) - ${selectedNode.sources.map(s => s.title || s.url || 'Untitled').join(', ')}` : 
          "Selected Node Sources: None",
        selectedNode.chatId ? `Selected Node Chat ID: ${selectedNode.chatId}` : "Selected Node Chat ID: None"
      );
    }

    const characterLimit = maxCharacters || 2000;
    contextParts.push(
      "",
      "=== INSTRUCTIONS ===",
      "- Return ONLY the MINDMAP_CHANGES JSON, no other text",
      `- Keep entire response under ${characterLimit} characters to fit remaining context`,
      "- Format: MINDMAP_CHANGES: {\"changes\": [{\"action\": \"create\", \"nodeId\": \"node-123\", \"parentId\": \"parent-id\", \"text\": \"Title\", \"notes\": \"Notes\", \"sources\": [{\"id\": \"src-123\", \"name\": \"Source Name\", \"directory\": \"Description\", \"type\": \"reference\"}]}]}"
    );

    return contextParts.join('\n');
  }

  /**
   * Serialize mindmap structure for context
   */
  private serializeMindmapStructure(node: MindMapNode, level: number = 0): string {
    const indent = '  '.repeat(level);
    let result = `${indent}- [${node.id}] "${node.text}"`;
    
    if (node.notes) {
      result += `\n${indent}  Notes: "${node.notes.length > 200 ? node.notes.substring(0, 200) + '...' : node.notes}"`;
    }
    
    if (node.sources && node.sources.length > 0) {
      result += `\n${indent}  Sources: ${node.sources.length} source(s)`;
      node.sources.forEach((source, idx) => {
        if (idx < 3) { // Show first 3 sources
          result += `\n${indent}    - ${source.title || source.url || 'Untitled source'}`;
        }
      });
      if (node.sources.length > 3) {
        result += `\n${indent}    - ... and ${node.sources.length - 3} more`;
      }
    }
    
    if (node.chatId) {
      result += `\n${indent}  Chat ID: ${node.chatId}`;
    }
    
    if (node.children && node.children.length > 0) {
      result += '\n' + node.children.map(child => 
        this.serializeMindmapStructure(child, level + 1)
      ).join('\n');
    }
    
    return result;
  }

  /**
   * Get current mindmap context
   */
  getCurrentMindmapContext(): MindmapContext | null {
    return this.currentMindmapContext;
  }

  /**
   * Clear mindmap context
   */
  clearMindmapContext(): void {
    this.currentMindmapContext = null;
    this.systemPrompt = this.createSystemPrompt();
    
    // Update the system message in the current conversation
    const systemMessage = this.conversation.find(msg => msg.role === 'system');
    if (systemMessage) {
      systemMessage.content = this.systemPrompt;
    }
  }

  /**
   * Override processMessage to use dynamic context-aware system prompt
   */
  async processMessage(userMessage: string, images?: any[], notes?: any[], onUpdate?: (message: any) => void): Promise<any> {
    // Update system prompt with current context limits before processing
    try {
      const dynamicSystemPrompt = await this.createSystemPromptWithContext();
      
      // Update the system message in the conversation
      const systemMessage = this.conversation.find(msg => msg.role === 'system');
      if (systemMessage) {
        systemMessage.content = dynamicSystemPrompt;
      }
      
      // Update the systemPrompt property
      this.systemPrompt = dynamicSystemPrompt;
      
    } catch (error) {
      logger.error('Failed to update system prompt with context limits:', error);
      // Fall back to regular system prompt
    }
    
    // Call the parent's processMessage method
    return super.processMessage(userMessage, images, notes, onUpdate);
  }

  // Mindmap-specific helper methods
  
  /**
   * Analyze text content and suggest a mindmap structure
   */
  analyzeMindmapStructure(content: string): {
    mainConcepts: string[];
    suggestedHierarchy: any;
    connections: Array<{from: string, to: string, relationship: string}>;
  } {
    // This is a placeholder for mindmap-specific analysis logic
    // You can implement more sophisticated content analysis here
    return {
      mainConcepts: [],
      suggestedHierarchy: {},
      connections: []
    };
  }

  /**
   * Create a new node with proper structure including notes and sources
   */
  createNodeStructure(text: string, notes?: string, sources?: any[], parentId?: string): Partial<MindMapNode> {
    return {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      notes: notes || null,
      sources: sources || [],
      children: []
    };
  }

  /**
   * Extract relevant information from node for context
   */
  extractNodeContext(node: MindMapNode): string {
    let context = `Node: "${node.text}"`;
    
    if (node.notes) {
      context += `\nNotes: ${node.notes}`;
    }
    
    if (node.sources && node.sources.length > 0) {
      context += `\nSources: ${node.sources.map(s => s.title || s.url || 'Untitled').join(', ')}`;
    }
    
    if (node.children && node.children.length > 0) {
      context += `\nChild nodes: ${node.children.map(c => c.text).join(', ')}`;
    }
    
    return context;
  }

  /**
   * Get all nodes in the mindmap as a flat array
   */
  getAllNodes(node?: MindMapNode): MindMapNode[] {
    if (!node) {
      node = this.currentMindmapContext?.mindMapData.root;
    }
    if (!node) return [];
    
    const nodes = [node];
    if (node.children) {
      for (const child of node.children) {
        nodes.push(...this.getAllNodes(child));
      }
    }
    return nodes;
  }

  /**
   * Search for nodes containing specific text in title, notes, or sources
   */
  searchNodes(query: string, searchInNotes: boolean = true, searchInSources: boolean = true): MindMapNode[] {
    if (!this.currentMindmapContext) return [];
    
    const allNodes = this.getAllNodes();
    const lowerQuery = query.toLowerCase();
    
    return allNodes.filter(node => {
      // Search in text
      if (node.text.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in notes
      if (searchInNotes && node.notes && node.notes.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in sources
      if (searchInSources && node.sources) {
        return node.sources.some(source => 
          (source.title && source.title.toLowerCase().includes(lowerQuery)) ||
          (source.url && source.url.toLowerCase().includes(lowerQuery)) ||
          (source.text && source.text.toLowerCase().includes(lowerQuery))
        );
      }
      
      return false;
    });
  }
}
