import type { ReactNode } from 'react';
import React from 'react';
import type { LucideProps } from 'lucide-react';
import { Cpu, Minus, Plus } from 'lucide-react';
import { WindowControls } from './WindowControls';
import { SystemInfo } from './SystemInfo';
import { useAppStore } from '../store/useAppStore';

export interface AppBarProps {
  /** Icon component (from lucide-react) */
  icon: React.ComponentType<LucideProps>;
  /** Title text */
  title: string;
  /** Color class for the icon (e.g., 'text-blue-400') */
  iconColor?: string;
  /** Additional actions/buttons on the right side */
  actions?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Unified App Bar component for all pages in MindStrike
 * Provides consistent styling and the draggable region for Electron
 */
export const AppBar: React.FC<AppBarProps> = ({
  icon: Icon,
  title,
  iconColor = 'text-blue-400',
  actions,
  className = '',
}) => {
  const {
    setShowLocalModelDialog,
    activeView,
    fontSize,
    increaseFontSize,
    decreaseFontSize,
  } = useAppStore();

  return (
    <div
      className={`shrink-0 px-6 border-b border-gray-700 flex items-center ${className}`}
      style={{ height: 'var(--header-height)' }}
      data-test-id="custom-draggable-region"
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <Icon size={24} className={iconColor} />
          <h1 className="text-xl font-semibold text-white">{title}</h1>
        </div>
        <div className="flex items-center space-x-2">
          <SystemInfo />

          {activeView !== 'settings' && (
            <button
              onClick={() => setShowLocalModelDialog(true)}
              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
              title="Manage Local Models"
            >
              <Cpu size={16} />
            </button>
          )}

          {/* Font Size Controls - only show for chat, mindmaps, and workspace views */}
          {(activeView === 'chat' ||
            activeView === 'mindmaps' ||
            activeView === 'workspace') && (
            <div className="flex items-center bg-gray-800 rounded px-1 ml-2">
              <button
                onClick={decreaseFontSize}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                title="Decrease font size"
              >
                <Minus size={14} />
              </button>
              <span className="text-xs text-gray-300 px-2 min-w-[40px] text-center">
                {fontSize}px
              </span>
              <button
                onClick={increaseFontSize}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                title="Increase font size"
              >
                <Plus size={14} />
              </button>
            </div>
          )}

          {actions}
          <WindowControls />
        </div>
      </div>
    </div>
  );
};
