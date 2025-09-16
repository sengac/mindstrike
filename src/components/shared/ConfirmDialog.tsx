import { ReactNode } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { BaseDialog } from './BaseDialog';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  icon?: ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  icon,
}: ConfirmDialogProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );

  if (!shouldRender) return null;

  const getColors = () => {
    switch (type) {
      case 'danger':
        return {
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          confirmBtn: 'bg-red-600 hover:bg-red-700',
        };
      case 'warning':
        return {
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          confirmBtn: 'bg-yellow-600 hover:bg-yellow-700',
        };
      case 'info':
        return {
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-600',
          confirmBtn: 'bg-blue-600 hover:bg-blue-700',
        };
    }
  };

  const colors = getColors();
  const defaultIcon =
    type === 'danger' ? (
      <Trash2 size={20} />
    ) : type === 'warning' ? (
      <AlertTriangle size={20} />
    ) : (
      <X size={20} />
    );

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
    >
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div
            className={`w-10 h-10 ${colors.iconBg} rounded-full flex items-center justify-center`}
          >
            <div className={colors.iconColor}>{icon || defaultIcon}</div>
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">{title}</h3>
            <p className="text-sm text-gray-400">
              This action cannot be undone.
            </p>
          </div>
        </div>

        <p className="text-gray-300 mb-6">{message}</p>

        <div className="flex space-x-3 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              handleClose();
            }}
            className={`px-4 py-2 ${colors.confirmBtn} text-white rounded transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </BaseDialog>
  );
}
