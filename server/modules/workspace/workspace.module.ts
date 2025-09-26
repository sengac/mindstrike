import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceFileController } from './workspace-file.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceFileService } from './services/workspace-file.service';

@Module({
  imports: [ConfigModule],
  controllers: [WorkspaceController, WorkspaceFileController],
  providers: [WorkspaceService, WorkspaceFileService],
  exports: [WorkspaceService, WorkspaceFileService],
})
export class WorkspaceModule {}
