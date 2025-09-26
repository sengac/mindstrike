import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  UpdateMindmapDto,
  IterateMindmapDto,
  GenerateMindmapDto,
} from './dto/mindmap.dto';
import { MindmapService } from './mindmap.service';

@ApiTags('mindmap')
@Controller('api')
export class MindmapController {
  constructor(private readonly mindmapService: MindmapService) {}

  @Get('mindmaps')
  @ApiOperation({ summary: 'Get all mindmaps' })
  @ApiResponse({
    status: 200,
    description: 'List of mindmaps',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          nodeCount: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getAllMindmaps() {
    return this.mindmapService.getAllMindmaps();
  }

  @Post('mindmaps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save all mindmaps' })
  @ApiBody({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        nodes: { type: 'array' },
        edges: { type: 'array' },
        metadata: { type: 'object' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Mindmaps saved successfully',
  })
  async saveMindmaps(@Body() mindmaps: Array<Record<string, unknown>>) {
    return this.mindmapService.saveMindmaps(mindmaps);
  }

  @Get('mindmaps/:mindmapId')
  @ApiOperation({ summary: 'Get mindmap by ID' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Mindmap details',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        nodes: { type: 'array' },
        edges: { type: 'array' },
        metadata: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Mindmap not found' })
  async getMindmap(@Param('mindmapId') mindmapId: string) {
    return this.mindmapService.getMindmap(mindmapId);
  }

  @Get('mindmaps/:mindmapId/mindmap')
  @ApiOperation({ summary: 'Get mindmap data' })
  @ApiParam({ name: 'mindmapId', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Mindmap data retrieved successfully',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiResponse({ status: 404, description: 'Mindmap not found' })
  async getMindmapData(@Param('mindmapId') mindmapId: string) {
    return this.mindmapService.getMindmapData(mindmapId);
  }

  @Post('mindmaps/:mindmapId/mindmap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save mindmap data' })
  @ApiParam({ name: 'mindmapId', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Mindmap data saved successfully',
  })
  @ApiResponse({ status: 404, description: 'Mindmap not found' })
  async saveMindmapData(
    @Param('mindmapId') mindmapId: string,
    @Body() mindmapData: Record<string, unknown>
  ) {
    return this.mindmapService.saveMindmapData(mindmapId, mindmapData);
  }

  @Post('mindmaps/:mindmapId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update mindmap data' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateMindmapDto })
  @ApiResponse({
    status: 200,
    description: 'Mindmap updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  async updateMindmap(
    @Param('mindmapId') mindmapId: string,
    @Body() dto: UpdateMindmapDto
  ) {
    return this.mindmapService.saveMindmap(mindmapId, dto);
  }

  @Post('mindmaps/:mindmapId/add-node')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a node to the mindmap' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        node: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            position: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
              },
            },
            data: { type: 'object' },
          },
        },
        parentNodeId: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Node added successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        nodeId: { type: 'string' },
      },
    },
  })
  async addNode(
    @Param('mindmapId') mindmapId: string,
    @Body()
    dto: {
      node: {
        id?: string;
        label: string;
        position?: { x: number; y: number };
        data?: Record<string, unknown>;
      };
      parentNodeId?: string;
    }
  ) {
    const mindmap = await this.mindmapService.getMindmap(mindmapId);
    const nodeId = dto.node.id ?? `node-${Date.now()}`;

    const newNode = {
      id: nodeId,
      type: 'concept',
      data: {
        ...dto.node.data,
        label: dto.node.label,
      },
      position: dto.node.position ?? { x: 100, y: 100 },
    };

    mindmap.nodes.push(newNode);

    if (dto.parentNodeId) {
      const newEdge = {
        id: `edge-${Date.now()}`,
        source: dto.parentNodeId,
        target: nodeId,
        type: 'default',
      };
      mindmap.edges.push(newEdge);
    }

    await this.mindmapService.saveMindmap(mindmapId, mindmap);

    return {
      success: true,
      nodeId: nodeId,
    };
  }

  @Post('mindmaps/:mindmapId/iterate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iterate on mindmap with AI' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiBody({ type: IterateMindmapDto })
  @ApiResponse({
    status: 200,
    description: 'Iteration completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        changes: { type: 'object' },
        newNodes: { type: 'array' },
        newEdges: { type: 'array' },
      },
    },
  })
  async iterateMindmap(
    @Param('mindmapId') mindmapId: string,
    @Body() dto: IterateMindmapDto
  ) {
    const result = await this.mindmapService.iterateMindmap(
      mindmapId,
      dto.prompt,
      dto.nodeId
    );

    return {
      success: result.success,
      changes: result.changes,
      newNodes: result.changes.addedNodes,
      newEdges: Array(result.changes.addedEdges).fill({}),
    };
  }

  @Post('mindmaps/:mindmapId/generate-children')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate child nodes with AI' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiBody({ type: GenerateMindmapDto })
  @ApiResponse({
    status: 200,
    description: 'Content generated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        generatedNodes: { type: 'array' },
        generatedEdges: { type: 'array' },
      },
    },
  })
  async generateChildren(
    @Param('mindmapId') mindmapId: string,
    @Body() dto: GenerateMindmapDto
  ) {
    const result = await this.mindmapService.generateContent(
      mindmapId,
      dto.prompt,
      dto.style
    );

    return {
      success: result.success,
      generatedNodes: result.generatedNodes,
      generatedEdges: result.generatedEdges,
    };
  }
}
