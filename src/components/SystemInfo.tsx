import React from 'react';
import { useSystemInformationStore } from '../store/use-system-information-store';
import { MemoryStick, HardDrive, Cpu, Zap } from 'lucide-react';
import { formatBytes } from '../utils/formatUtils';

export const SystemInfo: React.FC = () => {
  const { systemInfo, isLoading } = useSystemInformationStore();

  if (isLoading && systemInfo.lastUpdated === 0) {
    return <div className="text-xs text-gray-500">Loading system info...</div>;
  }

  const formatPercentage = (used: number, total: number): string => {
    const percentage = ((total - used) / total) * 100;
    return percentage.toFixed(1) + '%';
  };

  return (
    <div className="text-xs text-gray-500 flex gap-3 items-center">
      <div className="flex items-center gap-1" title="RAM Usage (Used/Total)">
        <MemoryStick size={12} />
        <span>
          {formatBytes(systemInfo.totalRAM - systemInfo.freeRAM)}/
          {formatBytes(systemInfo.totalRAM)} (
          {formatPercentage(systemInfo.freeRAM, systemInfo.totalRAM)})
        </span>
      </div>
      {systemInfo.vramState && (
        <div
          className="flex items-center gap-1"
          title="VRAM Usage (Used/Total)"
        >
          <Zap size={12} />
          <span>
            {formatBytes(systemInfo.vramState.used)}/
            {formatBytes(systemInfo.vramState.total)} (
            {formatPercentage(
              systemInfo.vramState.free,
              systemInfo.vramState.total
            )}
            )
          </span>
        </div>
      )}
      <div className="flex items-center gap-1" title="Available Disk Space">
        <HardDrive size={12} />
        <span>{formatBytes(systemInfo.diskSpace.free)}</span>
      </div>
      {systemInfo.gpuType && (
        <div className="flex items-center gap-1" title="GPU Type">
          <Cpu size={12} />
          <span>{systemInfo.gpuType}</span>
        </div>
      )}
    </div>
  );
};
