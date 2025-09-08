
import { MessageSquare, Files, Settings } from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
  activePanel: 'chat' | 'files';
  onPanelChange: (panel: 'chat' | 'files') => void;
}

export function Sidebar({ activePanel, onPanelChange }: SidebarProps) {
  const menuItems = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
    { id: 'files' as const, icon: Files, label: 'Files' }
  ];

  return (
    <div className="w-16 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-gray-700">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">P</span>
        </div>
      </div>

      {/* Menu items */}
      <nav className="flex-1 py-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPanelChange(item.id)}
            className={clsx(
              'w-full h-12 flex items-center justify-center hover:bg-gray-700 transition-colors',
              'border-r-2 border-transparent',
              activePanel === item.id && 'bg-gray-700 border-blue-500'
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
      <div className="p-4">
        <button 
          className="w-full h-12 flex items-center justify-center hover:bg-gray-700 rounded-lg transition-colors"
          title="Settings"
        >
          <Settings size={20} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
}
