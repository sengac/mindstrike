import React from 'react';
import { Network } from 'lucide-react';
import { KnowledgeGraph } from '../hooks/useKnowledgeGraphs';

interface KnowledgeGraphsViewProps {
  activeKnowledgeGraph: KnowledgeGraph | null;
}

export function KnowledgeGraphsView({ activeKnowledgeGraph }: KnowledgeGraphsViewProps) {
  return (
    <div className="flex-1 flex flex-col bg-gray-900 p-6">
      {activeKnowledgeGraph ? (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">{activeKnowledgeGraph.name}</h2>
            {activeKnowledgeGraph.description && (
              <p className="text-gray-400">{activeKnowledgeGraph.description}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Created: {activeKnowledgeGraph.createdAt.toLocaleDateString()} | 
              Last updated: {activeKnowledgeGraph.updatedAt.toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex-1 bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Network size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Knowledge graph content will be displayed here</p>
                <p className="text-sm mt-2">This is where you can visualize and manage your knowledge graph</p>
              </div>
            </div>
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
    </div>
  );
}
