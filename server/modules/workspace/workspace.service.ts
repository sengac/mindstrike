import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkspaceService {
  // Stubbed service implementation

  async getWorkspaceDirectory() {
    return {
      directory: '/workspace',
      exists: true,
      writable: true,
    };
  }

  async setWorkspaceDirectory(directory: string) {
    return {
      success: true,
      directory,
    };
  }

  async getWorkspaceRoot() {
    return {
      root: '/workspace',
      type: 'local',
    };
  }

  async setWorkspaceRoot(root: string) {
    return {
      success: true,
      root,
    };
  }

  async getWorkspaceFiles(path?: string, recursive?: boolean) {
    return [];
  }

  async getFile(path: string) {
    return {
      path,
      content: '',
      encoding: 'utf-8',
    };
  }

  async saveFile(path: string, content: string, backup?: boolean) {
    return {
      success: true,
      path,
      size: content.length,
    };
  }

  async deleteFile(path: string, moveToTrash?: boolean) {
    return {
      success: true,
      path,
    };
  }
}
