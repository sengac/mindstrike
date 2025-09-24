import {
  MessageSquare,
  Files,
  Settings,
  Network,
  FileText,
} from 'lucide-react';
import { clsx } from 'clsx';
import { NetworkEffect } from './NetworkEffect';
import { MusicPlayer } from './MusicPlayer';
import { SidebarMusicControls } from './SidebarMusicControls';
import type { AppView } from '../types';
import MCPIcon from './MCPIcon';

interface SidebarProps {
  activePanel: AppView;
  onPanelChange: (view: AppView) => void;
  isMusicPlayerOpen: boolean;
  setIsMusicPlayerOpen: (open: boolean) => void;
}

export function Sidebar({
  activePanel,
  onPanelChange,
  isMusicPlayerOpen,
  setIsMusicPlayerOpen,
}: SidebarProps) {
  const menuItems = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
    { id: 'mindmaps' as const, icon: Network, label: 'MindMaps' },
    { id: 'workspace' as const, icon: Files, label: 'Workspace' },
    { id: 'agents' as const, icon: MCPIcon, label: 'Agents' },
  ];

  return (
    <div className="w-16 bg-dark-panel border-r border-dark-border flex flex-col h-screen">
      {/* Logo */}
      <div
        className={`h-16 flex items-center justify-center border-b border-dark-border bg-blue-600 relative overflow-hidden ${
          window.electronAPI && navigator.platform.includes('Mac')
            ? 'h-[142px] items-end'
            : ''
        }`}
        data-test-id="sidebar-logo"
      >
        <NetworkEffect onHeartClick={() => setIsMusicPlayerOpen(true)} />
      </div>

      {/* Menu items */}
      <nav className="flex-1 py-4">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => onPanelChange(item.id)}
            className={clsx(
              'w-full h-12 flex items-center justify-center hover:bg-dark-hover transition-colors',
              'border-r-2 border-transparent',
              activePanel === item.id && 'bg-dark-hover border-blue-500'
            )}
            title={item.label}
          >
            <item.icon
              size={20}
              className={clsx(
                'text-gray-400',
                activePanel === item.id && 'text-blue-400'
              )}
            />
          </button>
        ))}

        {/* Music Controls underneath menu items */}
        <SidebarMusicControls />
      </nav>

      {/* Application Logs and Settings */}
      <div className="pb-4 px-2 space-y-2">
        <button
          onClick={() => onPanelChange('application-logs')}
          className={clsx(
            'w-full h-12 flex items-center justify-center hover:bg-dark-hover transition-colors',
            'border-r-2 border-transparent',
            activePanel === 'application-logs' &&
              'bg-dark-hover border-blue-500'
          )}
          title="Application Logs"
        >
          <FileText
            size={20}
            className={clsx(
              'text-gray-400',
              activePanel === 'application-logs' && 'text-blue-400'
            )}
          />
        </button>

        <button
          onClick={() => onPanelChange('settings')}
          className={clsx(
            'w-full h-12 flex items-center justify-center hover:bg-dark-hover transition-colors',
            'border-r-2 border-transparent',
            activePanel === 'settings' && 'bg-dark-hover border-blue-500'
          )}
          title="Settings"
        >
          <Settings
            size={20}
            className={clsx(
              'text-gray-400',
              activePanel === 'settings' && 'text-blue-400'
            )}
          />
        </button>
      </div>

      {/* MusicPlayer Dialog */}
      <MusicPlayer
        isOpen={isMusicPlayerOpen}
        onClose={() => setIsMusicPlayerOpen(false)}
      />
    </div>
  );
}
