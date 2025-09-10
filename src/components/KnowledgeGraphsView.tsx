import { useCallback, useState, useEffect } from 'react';
import { Network, Undo2, Redo2, RotateCcw, ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Settings } from 'lucide-react';
import { KnowledgeGraph } from '../hooks/useKnowledgeGraphs';
import MindMap, { MindMapData, MindMapControls } from './MindMap';
import { ControlsModal } from './ControlsModal';
import { useAppStore } from '../store/useAppStore';

interface KnowledgeGraphsViewProps {
  activeKnowledgeGraph: KnowledgeGraph | null;
}

export function KnowledgeGraphsView({ activeKnowledgeGraph }: KnowledgeGraphsViewProps) {
  const [mindMapData, setMindMapData] = useState<MindMapData | undefined>();
  const [mindMapControls, setMindMapControls] = useState<MindMapControls | null>(null);
  const [showControlsModal, setShowControlsModal] = useState(false);
  
  // Get key bindings from store
  const mindMapKeyBindings = useAppStore((state) => state.mindMapKeyBindings);
  const setMindMapKeyBindings = useAppStore((state) => state.setMindMapKeyBindings);

  // Load mindmap data when knowledge graph changes
  useEffect(() => {
    if (activeKnowledgeGraph?.id) {
      loadMindMapData(activeKnowledgeGraph.id);
    }
  }, [activeKnowledgeGraph?.id]);

  const handleKeyBindingsChange = useCallback((newBindings: Record<string, string>) => {
    setMindMapKeyBindings(newBindings);
  }, [setMindMapKeyBindings]);

  const loadMindMapData = async (knowledgeGraphId: string) => {
    try {
      const response = await fetch(`/api/knowledge-graphs/${knowledgeGraphId}/mindmap`);
      if (response.ok) {
        const data = await response.json();
        setMindMapData(data);
      } else if (response.status === 404) {
        // No existing mindmap data
        setMindMapData(undefined);
      }
    } catch (error) {
      console.error('Failed to load mindmap data:', error);
      setMindMapData(undefined);
    }
  };

  const saveMindMapData = useCallback(async (data: MindMapData) => {
    if (!activeKnowledgeGraph?.id) {
      console.warn('No active knowledge graph ID for saving mindmap');
      return;
    }

    try {
      
      const response = await fetch(`/api/knowledge-graphs/${activeKnowledgeGraph.id}/mindmap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {

      } else {
        console.error('Failed to save mindmap:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to save mindmap data:', error);
    }
  }, [activeKnowledgeGraph?.id]);

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      {activeKnowledgeGraph ? (
        <div className="flex flex-col h-full">
          <div className="pt-2 pr-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {activeKnowledgeGraph.description && (
                  <p className="text-gray-400">{activeKnowledgeGraph.description}</p>
                )}
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
            <MindMap
              knowledgeGraphId={activeKnowledgeGraph.id}
              onSave={saveMindMapData}
              initialData={mindMapData}
              onControlsReady={setMindMapControls}
              keyBindings={mindMapKeyBindings || {}}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <Network size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Select a knowledge graph to get started</p>
            <p className="text-sm mt-2">Choose from the list on the left or create a new knowledge graph</p>
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
