import { Injectable } from '@nestjs/common';
import { systemInfoManager } from '../../systemInfoManager';
import type { SystemInformation } from '../../systemInfoManager';
import { GlobalConfigService } from '../shared/services/global-config.service';

@Injectable()
export class SystemService {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  async getSystemInfo(): Promise<
    SystemInformation & { workspaceRoot: string }
  > {
    const systemInfo = await systemInfoManager.getSystemInfo();
    return {
      ...systemInfo,
      workspaceRoot: this.globalConfigService.getWorkspaceRoot(),
    };
  }
}
