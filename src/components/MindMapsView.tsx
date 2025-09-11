import { useCallback, useState, useEffect, useRef } from 'react';
import { Network, Undo2, Redo2, RotateCcw, ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Settings } from 'lucide-react';
import { MindMap as MindMapType } from '../hooks/useMindMaps';
import MindMap, { MindMapData, MindMapControls } from './MindMap';
import { ControlsModal } from './ControlsModal';
import { useAppStore } from '../store/useAppStore';

interface MindMapsViewProps {
  activeMindMap: MindMapType | null;
  // Props for external node updates
  pendingNodeUpdate?: {
    nodeId: string
    chatId?: string | null
    notes?: string | null
    timest: number
  }
}

export function MindMapsView({ activeMindMap, pendingNodeUpdate }: MindMapsViewProps) {
  const [mindMapData, setMindMapData] = useState<MindMapData | undefined>();
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [mindMapControls, setMindMapControls] = useState<MindMapControls | null>(null);
  const [showControlsModal, setShowControlsModal] = useState(false);
  
  // Get key bindings from store
  const mindMapKeyBindings = useAppStore((state) => state.mindMapKeyBindings);
  const setMindMapKeyBindings = useAppStore((state) => state.setMindMapKeyBindings);

  // Load mindmap data when MindMap changes
  useEffect(() => {
    if (activeMindMap?.id) {
      setIsDataLoaded(false);
      setMindMapControls(null); // Reset controls when switching mindmaps
      loadMindMapData(activeMindMap.id);
    }
  }, [activeMindMap?.id]);

  const handleKeyBindingsChange = useCallback((newBindings: Record<string, string>) => {
    setMindMapKeyBindings(newBindings);
  }, [setMindMapKeyBindings]);

  // No longer need to expose imperative functions - using props instead

  const loadMindMapData = async (mindMapId: string) => {
    try {
      const response = await fetch(`/api/mindmaps/${mindMapId}/mindmap`);
      if (response.ok) {
        const data = await response.json();
        setMindMapData(data);
      } else if (response.status === 404) {
        // No existing mindmap data
        setMindMapData(undefined);
      }
      setIsDataLoaded(true);
    } catch (error) {
      console.error('Failed to load mindmap data:', error);
      setMindMapData(undefined);
      setIsDataLoaded(true);
    }
  };

  // Debounced save function to prevent rapid consecutive saves
  const debouncedSave = useRef<NodeJS.Timeout | null>(null);
  const saveMindMapData = useCallback(async (data: MindMapData) => {
    if (!activeMindMap?.id) {
      console.warn('No active MindMap ID for saving mindmap');
      return;
    }

    // Clear any existing debounce timer
    if (debouncedSave.current) {
      clearTimeout(debouncedSave.current);
    }

    // Set a new debounce timer
    debouncedSave.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/mindmaps/${activeMindMap.id}/mindmap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        
        if (response.ok) {
          console.log('Mindmap saved successfully');
        } else {
          console.error('Failed to save mindmap:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error response body:', errorText);
        }
      } catch (error) {
        console.error('Failed to save mindmap data:', error);
      }
    }, 500); // 500ms debounce delay
  }, [activeMindMap?.id]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedSave.current) {
        clearTimeout(debouncedSave.current);
      }
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      {activeMindMap ? (
        <div className="flex flex-col h-full">
          <div className="pt-2 pr-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {activeMindMap.description && (
                  <p className="text-gray-400">{activeMindMap.description}</p>
                )}
                <div className="text-xs text-gray-500 mt-2 pl-4">
                  Built with {' '}
                  <a 
                    href="https://reactflow.dev" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gray-300 underline"
                  >
                    React Flow
                  </a>
                </div>
              </div>
              
              {/* MindMap Controls */}
              {mindMapControls && (
                <div className="flex items-center gap-4">
                  {/* Undo/Redo Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={mindMapControls.undo}
                      disabled={!mindMapControls.canUndo}
                      className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 size={14} />
                    </button>
                    <button
                      onClick={mindMapControls.redo}
                      disabled={!mindMapControls.canRedo}
                      className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
                      title="Redo (Ctrl+Shift+Z)"
                    >
                      <Redo2 size={14} />
                    </button>
                    <button
                      onClick={mindMapControls.resetLayout}
                      className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 text-gray-300"
                      title="Reset Layout"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => setShowControlsModal(true)}
                      className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 text-gray-300"
                      title="Controls & Keyboard Shortcuts"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                  
                  {/* Layout Direction Controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Layout:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => mindMapControls.changeLayout('LR')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls.currentLayout === 'LR' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Left to Right"
                      >
                        <ArrowRight size={12} />
                      </button>
                      <button
                        onClick={() => mindMapControls.changeLayout('RL')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls.currentLayout === 'RL' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Right to Left"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        onClick={() => mindMapControls.changeLayout('TB')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls.currentLayout === 'TB' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Top to Bottom"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        onClick={() => mindMapControls.changeLayout('BT')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls.currentLayout === 'BT' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Bottom to Top"
                      >
                        <ArrowUp size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1">
            {isDataLoaded ? (
              <MindMap
                key={activeMindMap.id}
                mindMapId={activeMindMap.id}
                onSave={saveMindMapData}
                initialData={mindMapData}
                onControlsReady={setMindMapControls}
                keyBindings={mindMapKeyBindings || {}}
                externalNodeUpdates={pendingNodeUpdate}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <p>Loading mindmap...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <Network size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Select a MindMap to get started</p>
<p className="text-sm mt-2">Choose from the list on the left or create a new MindMap</p>
          </div>
        </div>
      )}
      
      {/* Controls Modal */}
      <ControlsModal
        isOpen={showControlsModal}
        onClose={() => setShowControlsModal(false)}
        onKeyBindingsChange={handleKeyBindingsChange}
        initialKeyBindings={mindMapKeyBindings || {}}
      />
    </div>
  );
}
