import { Bot, Settings, Zap } from 'lucide-react';

export function AgentsPanel() {
  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 border-b border-gray-700 flex items-center" style={{height: 'var(--header-height)'}}>
        <div className="flex items-center gap-3">
          <Bot size={24} className="text-blue-400" />
          <h1 className="text-xl font-semibold text-white">Agents</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Built-in Agents Section */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Zap size={20} className="text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Built-in Agents</h2>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="text-center">
              <p className="text-gray-400 mb-2">No built-in agents available</p>
              <p className="text-sm text-gray-500">Built-in agents will appear here when configured</p>
            </div>
          </div>
        </div>

        {/* External MCP Servers Section */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Settings size={20} className="text-green-400" />
            <h2 className="text-lg font-semibold text-white">External MCP Servers</h2>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="text-center">
              <p className="text-gray-400 mb-2">No MCP servers configured</p>
              <p className="text-sm text-gray-500">Connect external MCP servers to extend functionality</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
