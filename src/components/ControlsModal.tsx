import React, { useState, useEffect } from 'react';
import { X, Edit2, Check, RotateCcw } from 'lucide-react';

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
    currentKey: 'Tab'
  },
  {
    id: 'addSibling',
    action: 'Add Sibling Node', 
    description: 'Add a sibling node to the selected node',
    defaultKey: 'Enter',
    currentKey: 'Enter'
  },
  {
    id: 'deleteNode',
    action: 'Delete Node',
    description: 'Delete the selected node and its children',
    defaultKey: 'Delete',
    currentKey: 'Delete'
  },
  {
    id: 'undo',
    action: 'Undo',
    description: 'Undo the last action',
    defaultKey: 'Ctrl+Z',
    currentKey: 'Ctrl+Z'
  },
  {
    id: 'redo',
    action: 'Redo',
    description: 'Redo the last undone action',
    defaultKey: 'Ctrl+Shift+Z',
    currentKey: 'Ctrl+Shift+Z'
  },
  {
    id: 'redoAlt',
    action: 'Redo (Alt)',
    description: 'Alternative redo shortcut',
    defaultKey: 'Ctrl+Y',
    currentKey: 'Ctrl+Y'
  },
  {
    id: 'openInference',
    action: 'Open AI Inferences',
    description: 'Open AI inference chat for the selected node',
    defaultKey: '.',
    currentKey: '.'
  }
];

export function ControlsModal({ isOpen, onClose, onKeyBindingsChange, initialKeyBindings }: ControlsModalProps) {
  const [keyBindings, setKeyBindings] = useState<KeyBinding[]>(DEFAULT_KEY_BINDINGS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [capturedKey, setCapturedKey] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);

  // Initialize key bindings from props
  useEffect(() => {
    if (initialKeyBindings) {
      setKeyBindings(prev => prev.map(binding => ({
        ...binding,
        currentKey: initialKeyBindings[binding.id] || binding.defaultKey
      })));
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
      
      const keyString = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
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
        binding.id === editingId ? { ...binding, currentKey: capturedKey } : binding
      );
      setKeyBindings(newBindings);
      
      // Convert to object format for parent
      const bindingsObject = newBindings.reduce((acc, binding) => {
        acc[binding.id] = binding.currentKey;
        return acc;
      }, {} as Record<string, string>);
      
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
      
      const bindingsObject = newBindings.reduce((acc, binding) => {
        acc[binding.id] = binding.currentKey;
        return acc;
      }, {} as Record<string, string>);
      
      onKeyBindingsChange(bindingsObject);
    }
  };

  const resetAllBindings = () => {
    const resetBindings = DEFAULT_KEY_BINDINGS.map(binding => ({
      ...binding,
      currentKey: binding.defaultKey
    }));
    setKeyBindings(resetBindings);
    
    const bindingsObject = resetBindings.reduce((acc, binding) => {
      acc[binding.id] = binding.currentKey;
      return acc;
    }, {} as Record<string, string>);
    
    onKeyBindingsChange(bindingsObject);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Controls & Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-300">
              Click the edit button to customize keyboard shortcuts. Press Escape to cancel editing.
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
            {keyBindings.map((binding) => (
              <div
                key={binding.id}
                className="flex items-center justify-between p-3 bg-gray-750 border border-gray-700 rounded"
              >
                <div className="flex-1">
                  <div className="text-white font-medium">{binding.action}</div>
                  <div className="text-gray-400 text-sm">{binding.description}</div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-gray-300">
                      {editingId === binding.id ? (
                        <span className="text-blue-400">
                          {isCapturing 
                            ? (capturedKey || 'Press a key...') 
                            : 'Click to capture'
                          }
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
          <h3 className="text-lg font-semibold text-white mb-3">Additional Actions</h3>
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
              <strong>Click brain icon:</strong> Open AI inferences
            </div>
            <div className="text-gray-300">
              <strong>Double-click node:</strong> Edit node text
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
