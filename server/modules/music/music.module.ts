import { Module } from '@nestjs/common';
import { MusicController } from './music.controller';
import { PlaylistController } from './playlist.controller';
import { AudioController } from './audio.controller';
import { MusicService } from './music.service';
import { PlaylistService } from './playlist.service';
import { MusicMetadataCacheService } from './music-metadata-cache.service';

@Module({
  controllers: [MusicController, PlaylistController, AudioController],
  providers: [MusicService, PlaylistService, MusicMetadataCacheService],
  exports: [MusicService, PlaylistService, MusicMetadataCacheService],
})
export class MusicModule {}
