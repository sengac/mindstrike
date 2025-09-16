import { useState, useEffect } from 'react';
import { X, Edit2, Check, RotateCcw } from 'lucide-react';
import { BaseDialog } from './shared/BaseDialog';
import { useDialogAnimation } from '../hooks/useDialogAnimation';

interface KeyBinding {
  id: string;
  action: string;
  description: string;
  defaultKey: string;
  currentKey: string;
}

interface ControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyBindingsChange: (keyBindings: Record<string, string>) => void;
  initialKeyBindings?: Record<string, string>;
}

const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  {
    id: 'addChild',
    action: 'Add Child Node',
    description: 'Add a child node to the selected node',
    defaultKey: 'Tab',
    currentKey: 'Tab',
  },
  {
    id: 'addSibling',
    action: 'Add Sibling Node',
    description: 'Add a sibling node to the selected node',
    defaultKey: 'Enter',
    currentKey: 'Enter',
  },
  {
    id: 'deleteNode',
    action: 'Delete Node',
    description: 'Delete the selected node and its children',
    defaultKey: 'Delete/Backspace',
    currentKey: 'Delete/Backspace',
  },
  {
    id: 'undo',
    action: 'Undo',
    description: 'Undo the last action',
    defaultKey: 'Ctrl+Z',
    currentKey: 'Ctrl+Z',
  },
  {
    id: 'redo',
    action: 'Redo',
    description: 'Redo the last undone action',
    defaultKey: 'Ctrl+Shift+Z',
    currentKey: 'Ctrl+Shift+Z',
  },
  {
    id: 'redoAlt',
    action: 'Redo (Alt)',
    description: 'Alternative redo shortcut',
    defaultKey: 'Ctrl+Y',
    currentKey: 'Ctrl+Y',
  },
  {
    id: 'openInference',
    action: 'Open Node Panel',
    description: 'Open Node Panel for the selected node',
    defaultKey: '.',
    currentKey: '.',
  },
  {
    id: 'openGenerative',
    action: 'Open Generative Panel',
    description: 'Open the generative AI panel for the selected node',
    defaultKey: '/',
    currentKey: '/',
  },
];

export function ControlsModal({
  isOpen,
  onClose,
  onKeyBindingsChange,
  initialKeyBindings,
}: ControlsModalProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );
  const [keyBindings, setKeyBindings] =
    useState<KeyBinding[]>(DEFAULT_KEY_BINDINGS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [capturedKey, setCapturedKey] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);

  // Initialize key bindings from props
  useEffect(() => {
    if (initialKeyBindings) {
      setKeyBindings(prev =>
        prev.map(binding => {
          // Handle reverse mapping for Delete/Backspace - if we find Delete or Backspace mapped to deleteNode, show as Delete/Backspace
          let currentKey = binding.defaultKey;

          if (binding.id === 'deleteNode') {
            // Check if either Delete or Backspace is mapped to deleteNode
            const hasDelete = Object.entries(initialKeyBindings).some(
              ([key, action]) =>
                (key === 'Delete' || key === 'Backspace') &&
                action === 'deleteNode'
            );
            if (hasDelete) {
              currentKey = 'Delete/Backspace';
            }
          } else {
            // For other actions, find the key that maps to this action
            const mappedKey = Object.entries(initialKeyBindings).find(
              ([_key, action]) => action === binding.id
            )?.[0];
            if (mappedKey) {
              currentKey = mappedKey;
            }
          }

          return {
            ...binding,
            currentKey,
          };
        })
      );
    }
  }, [initialKeyBindings]);

  // Handle key capture
  useEffect(() => {
    if (!isCapturing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      const modifiers = [];
      if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');

      let key = e.key;
      if (key === ' ') key = 'Space';
      if (key === 'Escape') {
        setIsCapturing(false);
        setEditingId(null);
        setCapturedKey('');
        return;
      }

      // Normalize Delete and Backspace to be displayed as one option
      if (key === 'Delete' || key === 'Backspace') {
        key = 'Delete/Backspace';
      }

      const keyString =
        modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
      setCapturedKey(keyString);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCapturing]);

  const startEditing = (id: string) => {
    setEditingId(id);
    setIsCapturing(true);
    setCapturedKey('');
  };

  const saveBinding = () => {
    if (editingId && capturedKey) {
      const newBindings = keyBindings.map(binding =>
        binding.id === editingId
          ? { ...binding, currentKey: capturedKey }
          : binding
      );
      setKeyBindings(newBindings);

      // Convert to object format for parent
      const bindingsObject = newBindings.reduce(
        (acc, binding) => {
          acc[binding.id] = binding.currentKey;
          return acc;
        },
        {} as Record<string, string>
      );

      onKeyBindingsChange(bindingsObject);
    }

    setEditingId(null);
    setIsCapturing(false);
    setCapturedKey('');
  };

  const resetBinding = (id: string) => {
    const binding = DEFAULT_KEY_BINDINGS.find(b => b.id === id);
    if (binding) {
      const newBindings = keyBindings.map(b =>
        b.id === id ? { ...b, currentKey: binding.defaultKey } : b
      );
      setKeyBindings(newBindings);

      const bindingsObject = newBindings.reduce(
        (acc, binding) => {
          acc[binding.id] = binding.currentKey;
          return acc;
        },
        {} as Record<string, string>
      );

      onKeyBindingsChange(bindingsObject);
    }
  };

  const resetAllBindings = () => {
    const resetBindings = DEFAULT_KEY_BINDINGS.map(binding => ({
      ...binding,
      currentKey: binding.defaultKey,
    }));
    setKeyBindings(resetBindings);

    const bindingsObject = resetBindings.reduce(
      (acc, binding) => {
        acc[binding.id] = binding.currentKey;
        return acc;
      },
      {} as Record<string, string>
    );

    onKeyBindingsChange(bindingsObject);
  };

  if (!shouldRender) return null;

  return (
    <BaseDialog
      isOpen={shouldRender}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth="max-w-2xl"
      className="max-h-[80vh] overflow-y-auto"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            Controls & Keyboard Shortcuts
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-300">
              Click the edit button to customize keyboard shortcuts. Press
              Escape to cancel editing.
            </p>
            <button
              onClick={resetAllBindings}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 text-sm"
            >
              <RotateCcw size={14} />
              Reset All
            </button>
          </div>

          <div className="space-y-3">
            {keyBindings.map(binding => (
              <div
                key={binding.id}
                className="flex items-center justify-between p-3 bg-gray-750 border border-gray-700 rounded"
              >
                <div className="flex-1">
                  <div className="text-white font-medium">{binding.action}</div>
                  <div className="text-gray-400 text-sm">
                    {binding.description}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-gray-300">
                      {editingId === binding.id ? (
                        <span className="text-blue-400">
                          {isCapturing
                            ? capturedKey || 'Press a key...'
                            : 'Click to capture'}
                        </span>
                      ) : (
                        <code className="bg-gray-700 px-2 py-1 rounded text-sm">
                          {binding.currentKey}
                        </code>
                      )}
                    </div>
                    {binding.currentKey !== binding.defaultKey && (
                      <div className="text-xs text-gray-500 mt-1">
                        Default: {binding.defaultKey}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {editingId === binding.id ? (
                      <>
                        <button
                          onClick={saveBinding}
                          disabled={!capturedKey}
                          className="p-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded"
                          title="Save"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setIsCapturing(false);
                            setCapturedKey('');
                          }}
                          className="p-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEditing(binding.id)}
                          className="p-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded"
                          title="Edit shortcut"
                        >
                          <Edit2 size={14} />
                        </button>
                        {binding.currentKey !== binding.defaultKey && (
                          <button
                            onClick={() => resetBinding(binding.id)}
                            className="p-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded"
                            title="Reset to default"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">
            Additional Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="text-gray-300">
              <strong>Click crown icon:</strong> Make node root
            </div>
            <div className="text-gray-300">
              <strong>Click collapse icon:</strong> Toggle node collapse
            </div>
            <div className="text-gray-300">
              <strong>Click on node:</strong> Select node
            </div>
            <div className="text-gray-300">
              <strong>Click on background:</strong> Deselect all
            </div>
            <div className="text-gray-300">
              <strong>Click brain icon:</strong> Open Node Panel
            </div>
            <div className="text-gray-300">
              <strong>Double-click node:</strong> Edit node text
            </div>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
