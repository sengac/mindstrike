import { useCallback, useState, useEffect, useRef } from 'react';
import { Network, Undo2, Redo2, RotateCcw, ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Settings } from 'lucide-react';
import { MindMap as MindMapType } from '../hooks/useMindMaps';
import { MindMap } from './MindMap';
import { ControlsModal } from '../../components/ControlsModal';
import { ColorPalette } from '../../components/ColorPalette';
import { useAppStore } from '../../store/useAppStore';
import { Source } from '../types/mindMap';
import { MindMapData } from '../../utils/mindMapData';

// Import the new store hooks
import { 
  useMindMapHistory, 
  useMindMapSelection,
  useMindMapLayout,
  useMindMapActions,
  useMindMapStore
} from '../../store/useMindMapStore';

interface MindMapsViewProps {
  activeMindMap: MindMapType | null;
  loadMindMaps: (preserveActiveId?: boolean) => Promise<void>;
  // Props for external node updates
  pendingNodeUpdate?: {
    nodeId: string
    chatId?: string | null
    notes?: string | null
    sources?: Source[]
    timestamp: number
  }
}

export function MindMapsView({ activeMindMap, loadMindMaps, pendingNodeUpdate }: MindMapsViewProps) {
  const [mindMapData, setMindMapData] = useState<MindMapData | undefined>();
  const [loadedMindMapId, setLoadedMindMapId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const loadingRef = useRef<string | null>(null);
  
  // Get key bindings from store
  const mindMapKeyBindings = useAppStore((state) => state.mindMapKeyBindings);
  const setMindMapKeyBindings = useAppStore((state) => state.setMindMapKeyBindings);

  // Get state from MindMap store
  const { selectedNodeId } = useMindMapSelection();
  const { setNodeColors, clearNodeColors } = useMindMapActions();
  
  // Get store state for checking initialization
  const isInitialized = useMindMapStore(state => state.isInitialized);
  const currentMindMapId = useMindMapStore(state => state.mindMapId);

  // Load mindmap data when MindMap changes
  useEffect(() => {
    if (activeMindMap?.id && loadingRef.current !== activeMindMap.id) {
      loadingRef.current = activeMindMap.id;
      setIsDataLoaded(false);
      // Clear any existing data to prevent showing stale data
      setMindMapData(undefined);
      loadMindMapData(activeMindMap.id);
    }
  }, [activeMindMap?.id]);

  const handleKeyBindingsChange = useCallback((newBindings: Record<string, string>) => {
    // Transform the bindings to expand Delete/Backspace into separate entries
    const expandedBindings: Record<string, string> = {};
    
    Object.entries(newBindings).forEach(([actionId, key]) => {
      if (key === 'Delete/Backspace') {
        // Map both Delete and Backspace to the same action
        expandedBindings['Delete'] = actionId;
        expandedBindings['Backspace'] = actionId;
      } else {
        expandedBindings[key] = actionId;
      }
    });
    
    setMindMapKeyBindings(expandedBindings);
  }, [setMindMapKeyBindings]);

  const loadMindMapData = async (mindMapId: string) => {
    try {
      const response = await fetch(`/api/mindmaps/${mindMapId}/mindmap`);
      if (response.ok) {
        const data = await response.json();
        setMindMapData(data);
        setLoadedMindMapId(mindMapId); // Track which mindmap this data belongs to
      } else if (response.status === 404) {
        // No existing mindmap data
        setMindMapData(undefined);
        setLoadedMindMapId(mindMapId); // Still track the ID even with no data
      }
      setIsDataLoaded(true);
      loadingRef.current = null; // Reset loading state
    } catch (error) {
      console.error('Failed to load mindmap data:', error);
      setMindMapData(undefined);
      setLoadedMindMapId(null);
      setIsDataLoaded(true);
      loadingRef.current = null; // Reset loading state
    }
  };

  // Save function - immediate save without debouncing
  const saveMindMapData = useCallback(async (data: MindMapData) => {
    if (!activeMindMap?.id) {
      console.warn('No active MindMap ID for saving mindmap');
      return;
    }

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
        // Reload mindmaps to refresh the updated timestamp, preserving active mindmap
        loadMindMaps(true);
      } else {
        console.error('Failed to save mindmap:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response body:', errorText);
      }
    } catch (error) {
      console.error('Failed to save mindmap data:', error);
    }
  }, [activeMindMap?.id, loadMindMaps]);

  // Store the mindmap controls
  const [mindMapControls, setMindMapControls] = useState<any>(null);

  // Control handlers that use the actual MindMap component controls
  const handleUndo = useCallback(() => {
    if (mindMapControls?.undo) {
      mindMapControls.undo();
    }
  }, [mindMapControls]);

  const handleRedo = useCallback(() => {
    if (mindMapControls?.redo) {
      mindMapControls.redo();
    }
  }, [mindMapControls]);

  const handleResetLayout = useCallback(async () => {
    if (mindMapControls?.resetLayout) {
      mindMapControls.resetLayout();
    }
  }, [mindMapControls]);

  const handleChangeLayout = useCallback(async (newLayout: 'LR' | 'RL' | 'TB' | 'BT') => {
    if (mindMapControls?.changeLayout) {
      mindMapControls.changeLayout(newLayout);
    }
  }, [mindMapControls]);

  const handleSetNodeColors = useCallback((nodeId: string, colors: { backgroundClass: string; foregroundClass: string }) => {
    setNodeColors(nodeId, colors);
  }, [setNodeColors]);

  const handleClearNodeColors = useCallback((nodeId: string) => {
    clearNodeColors(nodeId);
  }, [clearNodeColors]);

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
              
              {/* MindMap Controls - only show when store is initialized */}
              {isInitialized && currentMindMapId === activeMindMap.id && (
                <div className="flex items-center gap-4" data-mindmap-controls>
                  {/* Undo/Redo Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleUndo}
                      disabled={!mindMapControls?.canUndo}
                      className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 size={14} />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={!mindMapControls?.canRedo}
                      className="p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
                      title="Redo (Ctrl+Shift+Z)"
                    >
                      <Redo2 size={14} />
                    </button>
                    <button
                      onClick={handleResetLayout}
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
                    
                    {/* Color Palette */}
                    {selectedNodeId && (
                      <ColorPalette
                        selectedNodeId={selectedNodeId}
                        onColorChange={(colors) => {
                          if (selectedNodeId) {
                            handleSetNodeColors(selectedNodeId, colors);
                          }
                        }}
                        onColorClear={() => {
                          if (selectedNodeId) {
                            handleClearNodeColors(selectedNodeId);
                          }
                        }}
                      />
                    )}
                  </div>
                  
                  {/* Layout Direction Controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Layout:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleChangeLayout('LR')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls?.currentLayout === 'LR' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Left to Right"
                      >
                        <ArrowRight size={12} />
                      </button>
                      <button
                        onClick={() => handleChangeLayout('RL')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls?.currentLayout === 'RL' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Right to Left"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        onClick={() => handleChangeLayout('TB')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls?.currentLayout === 'TB' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
                        }`}
                        title="Top to Bottom"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        onClick={() => handleChangeLayout('BT')}
                        className={`p-1.5 border border-gray-600 rounded hover:bg-gray-600 text-gray-300 ${
                          mindMapControls?.currentLayout === 'BT' ? 'bg-blue-600 border-blue-500' : 'bg-gray-700'
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
            {isDataLoaded && loadedMindMapId === activeMindMap.id ? (
              <MindMap
                key={activeMindMap.id}
                mindMapId={activeMindMap.id}
                onSave={saveMindMapData}
                initialData={mindMapData}
                keyBindings={mindMapKeyBindings || {}}
                externalNodeUpdates={pendingNodeUpdate}
                onControlsReady={setMindMapControls}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading...
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
