import { Bot } from 'lucide-react';

export function AgentsPanel() {
  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Bot size={24} className="text-blue-400" />
          <h1 className="text-xl font-semibold text-white">Agents</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500">
              Configure built-in agents and external agents using MCP
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
