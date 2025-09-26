import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export interface MindMapNode {
  id: string;
  type?: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface IterateResult {
  success: boolean;
  changes: {
    addedNodes: MindMapNode[];
    addedEdges: number;
  };
}

interface SaveResult {
  success: boolean;
  id: string;
}

interface GenerateContentResult {
  success: boolean;
  generatedNodes: MindMapNode[];
  generatedEdges: MindMapEdge[];
}

interface AutoOrganizeResult {
  success: boolean;
  layoutChanges: {
    algorithm: string;
    nodesRepositioned: number;
  };
}

@Injectable()
export class MindmapService {
  private readonly logger = new Logger(MindmapService.name);
  private workspaceRoot: string;
  private mindmapsPath: string;

  constructor(private configService: ConfigService) {
    this.workspaceRoot =
      this.configService?.get<string>('WORKSPACE_ROOT') ?? process.cwd();
    this.mindmapsPath = path.join(
      this.workspaceRoot,
      'mindstrike-mindmaps.json'
    );
  }

  async getAllMindmaps(): Promise<MindMap[]> {
    try {
      const data = await fs.readFile(this.mindmapsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, return empty array
      this.logger.debug('No mindmaps file found, returning empty array');
      return [];
    }
  }

  async createMindmap(
    title: string,
    nodes?: MindMapNode[],
    edges?: MindMapEdge[]
  ): Promise<MindMap> {
    const mindmaps = await this.getAllMindmaps();

    const newMindmap: MindMap = {
      id: uuidv4(),
      title: title || 'Untitled Mindmap',
      nodes: nodes || [],
      edges: edges || [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mindmaps.push(newMindmap);
    await this.saveMindmapsToFile(mindmaps);

    this.logger.log(`Created new mindmap: ${newMindmap.id}`);
    return newMindmap;
  }

  async getMindmap(mindmapId: string): Promise<MindMap> {
    const mindmaps = await this.getAllMindmaps();
    const mindmap = mindmaps.find(m => m.id === mindmapId);

    if (!mindmap) {
      throw new NotFoundException(`Mindmap with ID ${mindmapId} not found`);
    }

    return mindmap;
  }

  async iterateMindmap(
    mindmapId: string,
    prompt: string,
    nodeId?: string
  ): Promise<IterateResult> {
    // This would integrate with the mindmap agent for iterative generation
    // For now, add a simple node based on the prompt
    const mindmap = await this.getMindmap(mindmapId);

    const newNode: MindMapNode = {
      id: uuidv4(),
      type: 'concept',
      data: {
        label: prompt.substring(0, 50),
        prompt: prompt,
        parentNode: nodeId,
      },
      position: {
        x: Math.random() * 500 + 100,
        y: Math.random() * 500 + 100,
      },
    };

    mindmap.nodes.push(newNode);

    // If there's a parent node, create an edge
    if (nodeId) {
      const newEdge: MindMapEdge = {
        id: uuidv4(),
        source: nodeId,
        target: newNode.id,
        type: 'default',
      };
      mindmap.edges.push(newEdge);
    }

    mindmap.updatedAt = new Date();
    await this.updateMindmap(mindmapId, mindmap);

    return {
      success: true,
      changes: {
        addedNodes: [newNode],
        addedEdges: nodeId ? 1 : 0,
      },
    };
  }

  async saveMindmap(
    mindmapId: string,
    updates: Record<string, unknown>
  ): Promise<SaveResult> {
    const mindmap = await this.getMindmap(mindmapId);

    // Merge updates into mindmap
    Object.assign(mindmap, updates, {
      id: mindmapId, // Preserve ID
      updatedAt: new Date(),
    });

    await this.updateMindmap(mindmapId, mindmap);

    return {
      success: true,
      id: mindmapId,
    };
  }

  async generateContent(
    mindmapId: string,
    prompt: string,
    style?: string
  ): Promise<GenerateContentResult> {
    // This would integrate with the AI agent to generate mindmap content
    // For now, create a simple structure based on the prompt
    const mindmap = await this.getMindmap(mindmapId);

    const centralNode: MindMapNode = {
      id: uuidv4(),
      type: style || 'concept',
      data: { label: prompt },
      position: { x: 400, y: 300 },
    };

    // Generate some related nodes
    const relatedNodes: MindMapNode[] = [
      {
        id: uuidv4(),
        type: 'idea',
        data: { label: `Aspect 1 of ${prompt}` },
        position: { x: 200, y: 200 },
      },
      {
        id: uuidv4(),
        type: 'idea',
        data: { label: `Aspect 2 of ${prompt}` },
        position: { x: 600, y: 200 },
      },
      {
        id: uuidv4(),
        type: 'idea',
        data: { label: `Aspect 3 of ${prompt}` },
        position: { x: 400, y: 500 },
      },
    ];

    const edges: MindMapEdge[] = relatedNodes.map(node => ({
      id: uuidv4(),
      source: centralNode.id,
      target: node.id,
      type: 'default',
    }));

    mindmap.nodes.push(centralNode, ...relatedNodes);
    mindmap.edges.push(...edges);
    mindmap.updatedAt = new Date();

    await this.updateMindmap(mindmapId, mindmap);

    return {
      success: true,
      generatedNodes: [centralNode, ...relatedNodes],
      generatedEdges: edges,
    };
  }

  async autoOrganize(
    mindmapId: string,
    algorithm?: string
  ): Promise<AutoOrganizeResult> {
    const mindmap = await this.getMindmap(mindmapId);

    // Simple circular layout algorithm
    const centerX = 400;
    const centerY = 300;
    const radius = 200;

    if (algorithm === 'circular' || !algorithm) {
      mindmap.nodes = mindmap.nodes.map((node, index) => {
        const angle = (2 * Math.PI * index) / mindmap.nodes.length;
        return {
          ...node,
          position: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          },
        };
      });
    } else if (algorithm === 'grid') {
      const cols = Math.ceil(Math.sqrt(mindmap.nodes.length));
      mindmap.nodes = mindmap.nodes.map((node, index) => ({
        ...node,
        position: {
          x: (index % cols) * 150 + 100,
          y: Math.floor(index / cols) * 150 + 100,
        },
      }));
    }

    mindmap.updatedAt = new Date();
    await this.updateMindmap(mindmapId, mindmap);

    return {
      success: true,
      layoutChanges: {
        algorithm: algorithm || 'circular',
        nodesRepositioned: mindmap.nodes.length,
      },
    };
  }

  private async updateMindmap(
    mindmapId: string,
    mindmap: MindMap
  ): Promise<void> {
    const mindmaps = await this.getAllMindmaps();
    const index = mindmaps.findIndex(m => m.id === mindmapId);

    if (index === -1) {
      throw new NotFoundException(`Mindmap with ID ${mindmapId} not found`);
    }

    mindmaps[index] = mindmap;
    await this.saveMindmapsToFile(mindmaps);
  }

  private async saveMindmapsToFile(mindmaps: MindMap[]): Promise<void> {
    try {
      await fs.writeFile(
        this.mindmapsPath,
        JSON.stringify(mindmaps, null, 2),
        'utf-8'
      );
      this.logger.debug(`Saved ${mindmaps.length} mindmaps to file`);
    } catch (error) {
      this.logger.error('Failed to save mindmaps to file', error);
      throw error;
    }
  }
}
