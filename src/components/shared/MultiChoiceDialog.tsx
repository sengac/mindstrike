import { ReactNode } from 'react';
import { BaseDialog } from './BaseDialog';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';

interface Choice {
  text: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface MultiChoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  choices: Choice[];
  icon?: ReactNode;
}

export function MultiChoiceDialog({
  isOpen,
  onClose,
  title,
  message,
  choices,
  icon
}: MultiChoiceDialogProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(isOpen, onClose);

  if (!shouldRender) return null;

  const getChoiceClasses = (variant: string = 'primary') => {
    switch (variant) {
      case 'danger':
        return 'px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors';
      case 'secondary':
        return 'px-4 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors';
      case 'primary':
      default:
        return 'px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors';
    }
  };

  return (
    <BaseDialog isOpen={shouldRender} onClose={handleClose} isVisible={isVisible}>
      <div className="p-6">
        {icon && (
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <div className="text-blue-600">
                {icon}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">{title}</h3>
            </div>
          </div>
        )}
        
        {!icon && (
          <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
        )}
        
        <p className="text-gray-300 mb-6">
          {message}
        </p>
        
        <div className="flex justify-end space-x-3">
          {choices.map((choice, index) => (
            <button
              key={index}
              onClick={() => {
                choice.onClick();
                handleClose();
              }}
              className={getChoiceClasses(choice.variant)}
            >
              {choice.text}
            </button>
          ))}
        </div>
      </div>
    </BaseDialog>
  );
}
