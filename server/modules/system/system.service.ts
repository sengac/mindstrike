import { Injectable, OnModuleInit } from '@nestjs/common';
import { systemInfoManager } from '../../systemInfoManager';
import type { SystemInformation } from '../../systemInfoManager';
import { getWorkspaceRoot } from '../../shared/utils/settings-directory';
import { getHomeDirectory } from '../../utils/settingsDirectory';

@Injectable()
export class SystemService implements OnModuleInit {
  private workspaceRoot: string;

  async onModuleInit() {
    // Load persisted workspace root from settings
    const persistedWorkspaceRoot = await getWorkspaceRoot();
    this.workspaceRoot =
      persistedWorkspaceRoot ||
      process.env.WORKSPACE_ROOT ||
      getHomeDirectory();
  }

  async getSystemInfo(): Promise<
    SystemInformation & { workspaceRoot: string }
  > {
    const systemInfo = await systemInfoManager.getSystemInfo();
    return {
      ...systemInfo,
      workspaceRoot: this.workspaceRoot,
    };
  }
}
