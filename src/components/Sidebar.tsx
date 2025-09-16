import { MessageSquare, Files, Settings, Bot, Network } from 'lucide-react';
import { clsx } from 'clsx';
import { MatrixEffect } from './MatrixEffect';

interface SidebarProps {
  activePanel: 'chat' | 'files' | 'agents' | 'mind-maps' | 'settings';
  onPanelChange: (
    panel: 'chat' | 'files' | 'agents' | 'mind-maps' | 'settings'
  ) => void;
}

export function Sidebar({ activePanel, onPanelChange }: SidebarProps) {
  const menuItems = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
    { id: 'mind-maps' as const, icon: Network, label: 'MindMaps' },
    { id: 'files' as const, icon: Files, label: 'Workspace' },
    { id: 'agents' as const, icon: Bot, label: 'Agents' },
  ];

  return (
    <div className="w-16 bg-dark-panel border-r border-dark-border flex flex-col h-screen">
      {/* Logo */}
      <div
        className="h-16 flex items-center justify-center border-b border-dark-border bg-blue-600 relative overflow-hidden"
        data-test-id="sidebar-logo"
      >
        <MatrixEffect />
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
      </nav>

      {/* Settings */}
      <div className="pb-4 px-2">
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
    </div>
  );
}
