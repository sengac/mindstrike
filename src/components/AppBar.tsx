import React, { ReactNode } from 'react';
import { LucideProps } from 'lucide-react';
import { WindowControls } from './WindowControls';

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
  return (
    <div
      className={`flex-shrink-0 px-6 border-b border-gray-700 flex items-center ${className}`}
      style={{ height: 'var(--header-height)' }}
      data-test-id="custom-draggable-region"
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <Icon size={24} className={iconColor} />
          <h1 className="text-xl font-semibold text-white">{title}</h1>
        </div>
        <div className="flex items-center space-x-4">
          {actions}
          <WindowControls />
        </div>
      </div>
    </div>
  );
};
