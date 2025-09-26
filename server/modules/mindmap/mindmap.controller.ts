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
  CreateMindmapDto,
  UpdateMindmapDto,
  IterateMindmapDto,
  GenerateMindmapDto,
  AutoOrganizeDto,
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
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new mindmap' })
  @ApiBody({ type: CreateMindmapDto })
  @ApiResponse({
    status: 201,
    description: 'Mindmap created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        nodes: { type: 'array' },
        edges: { type: 'array' },
      },
    },
  })
  async createMindmap(@Body() dto: CreateMindmapDto) {
    return this.mindmapService.createMindmap(dto.title, dto.nodes, dto.edges);
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
    // Stubbed implementation
    return {
      id: mindmapId,
      title: 'Stub Mindmap',
      nodes: [],
      edges: [],
      metadata: {},
    };
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
    return this.mindmapService.updateMindmap(mindmapId, dto);
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
    // Stubbed implementation
    return {
      success: true,
      nodeId: dto.node?.id || 'new-node-id',
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
    // Stubbed implementation
    return {
      success: true,
      changes: {},
      newNodes: [],
      newEdges: [],
    };
  }

  @Post('mindmaps/:mindmapId/auto-save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-save mindmap changes' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateMindmapDto })
  @ApiResponse({ status: 200, description: 'Mindmap saved successfully' })
  async autoSaveMindmap(
    @Param('mindmapId') mindmapId: string,
    @Body() dto: UpdateMindmapDto
  ) {
    // Stubbed implementation
    return {
      success: true,
      id: mindmapId,
      updatedAt: new Date().toISOString(),
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
    // Stubbed implementation
    return {
      success: true,
      generatedNodes: [],
      generatedEdges: [],
    };
  }

  @Post('mindmaps/:mindmapId/auto-organize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-organize mindmap layout' })
  @ApiParam({ name: 'mindmapId', type: 'string', format: 'uuid' })
  @ApiBody({ type: AutoOrganizeDto })
  @ApiResponse({
    status: 200,
    description: 'Layout organized',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        layoutChanges: { type: 'object' },
      },
    },
  })
  async autoOrganize(
    @Param('mindmapId') mindmapId: string,
    @Body() dto: AutoOrganizeDto
  ) {
    // Stubbed implementation
    return {
      success: true,
      layoutChanges: {},
    };
  }
}
