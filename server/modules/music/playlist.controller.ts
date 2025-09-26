import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { PlaylistService } from './playlist.service';

@ApiTags('playlists')
@Controller('api/playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  @Post('save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save playlists' })
  @ApiBody({
    description: 'Array of playlists to save',
    schema: {
      type: 'array',
      items: { type: 'object' },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Playlists saved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to save playlists' })
  async savePlaylists(@Body() playlists: unknown[]) {
    try {
      const result = await this.playlistService.savePlaylists(playlists);
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save playlists';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get('load')
  @ApiOperation({ summary: 'Load all playlists' })
  @ApiResponse({
    status: 200,
    description: 'List of playlists',
    schema: {
      type: 'array',
      items: { type: 'object' },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to load playlists' })
  async loadPlaylists() {
    try {
      const playlists = await this.playlistService.loadPlaylists();
      return playlists;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load playlists';
      throw new InternalServerErrorException(errorMessage);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get playlist by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Playlist details',
    schema: { type: 'object' },
  })
  @ApiResponse({ status: 404, description: 'Playlist not found' })
  @ApiResponse({ status: 500, description: 'Invalid playlists file format' })
  async getPlaylist(@Param('id') id: string) {
    try {
      const playlist = await this.playlistService.getPlaylistById(id);
      return playlist;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        if (error.message === 'Playlist not found') {
          throw new NotFoundException('Playlist not found');
        }
        throw new InternalServerErrorException('Invalid playlists file format');
      }
      throw new InternalServerErrorException('Failed to get playlist');
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a playlist' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Playlist deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to delete playlist' })
  async deletePlaylist(@Param('id') id: string) {
    try {
      const result = await this.playlistService.deletePlaylistById(id);
      return result;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw new InternalServerErrorException('Invalid playlists file format');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete playlist';
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
