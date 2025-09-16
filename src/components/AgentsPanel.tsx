import {
  Settings,
  Power,
  AlertCircle,
  CheckCircle,
  Edit,
  Save,
  X,
  Terminal,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { CodeEditor } from './CodeEditor';

interface MCPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  enabled: boolean;
  description?: string;
}

interface MCPTool {
  name: string;
  description: string;
  serverId: string;
}

interface MCPStatus {
  connectedServers: number;
  totalServers: number;
  totalTools: number;
  servers: string[];
}

export function AgentsPanel() {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [mcpStatus, setMcpStatus] = useState<MCPStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [configContent, setConfigContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMCPData();
  }, []);

  const fetchMCPData = async () => {
    try {
      const [serversRes, toolsRes, statusRes] = await Promise.all([
        fetch('/api/mcp/servers'),
        fetch('/api/mcp/tools'),
        fetch('/api/mcp/status'),
      ]);

      if (serversRes.ok) {
        const data = await serversRes.json();
        setMcpServers(data.servers || []);
      }

      if (toolsRes.ok) {
        const data = await toolsRes.json();
        setMcpTools(data.tools || []);
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        setMcpStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch MCP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMCPServer = async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        await fetchMCPData();
      }
    } catch (error) {
      console.error('Failed to toggle MCP server:', error);
    }
  };

  const loadConfigContent = async () => {
    try {
      const response = await fetch('/api/mcp/config');
      if (response.ok) {
        const data = await response.json();
        setConfigContent(data.config);
        setShowConfigEditor(true);
      }
    } catch (error) {
      console.error('Failed to load MCP config:', error);
    }
  };

  const saveConfigContent = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configContent }),
      });

      if (response.ok) {
        setShowConfigEditor(false);
        await fetchMCPData(); // Refresh the MCP data
      } else {
        const error = await response.json();
        alert(`Failed to save config: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to save MCP config:', error);
      alert('Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
      {/* Header */}
      <div
        className="px-6 border-b border-gray-700 flex items-center justify-between"
        style={{ height: 'var(--header-height)' }}
      >
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-green-400" />
          <h1 className="text-xl font-semibold text-white">MCP Agents</h1>
        </div>
        {mcpStatus && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-gray-300">
                {mcpStatus.connectedServers}/{mcpStatus.totalServers} servers
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-green-400" />
              <span className="text-gray-300">
                {mcpStatus.totalTools} tools
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* MCP Servers Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Settings size={20} className="text-green-400" />
              <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => (window as any).openDebugDialog?.('mcp')}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
              >
                <Terminal size={16} />
                View Logs
              </button>
              <button
                onClick={loadConfigContent}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                <Edit size={16} />
                Edit Config
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="text-center text-gray-400">
                Loading MCP servers...
              </div>
            </div>
          ) : mcpServers.length === 0 ? (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="text-center">
                <Settings size={32} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-2">No MCP servers configured</p>
                <p className="text-sm text-gray-500">
                  Add MCP servers to extend functionality with external tools
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mcpServers.map(server => {
                const isConnected = mcpStatus?.servers.includes(server.id);
                const serverTools = mcpTools.filter(
                  tool => tool.serverId === server.id
                );

                return (
                  <div
                    key={server.id}
                    className="bg-gray-800 rounded-lg border border-gray-700 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <Settings size={16} className="text-green-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white">
                            {server.name}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {server.description || server.command}
                          </p>
                          {serverTools.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {serverTools.length} tool
                              {serverTools.length !== 1 ? 's' : ''} available
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {isConnected ? (
                            <CheckCircle size={16} className="text-green-400" />
                          ) : (
                            <AlertCircle size={16} className="text-red-400" />
                          )}
                          <span className="text-xs text-gray-400">
                            {isConnected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            toggleMCPServer(server.id, !server.enabled)
                          }
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                            server.enabled
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                          }`}
                        >
                          <Power size={14} />
                          {server.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    </div>

                    {/* Server Tools */}
                    {serverTools.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {serverTools.map(tool => (
                            <div
                              key={tool.name}
                              className="bg-gray-700/50 rounded px-3 py-2"
                            >
                              <div className="font-medium text-sm text-white">
                                {tool.name}
                              </div>
                              <div className="text-xs text-gray-400 line-clamp-2">
                                {tool.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* MCP Config Editor Modal */}
      {showConfigEditor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <Settings size={20} className="text-green-400" />
                <h2 className="text-lg font-semibold text-white">
                  MCP Configuration Editor
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveConfigContent}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white text-sm rounded-lg transition-colors"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setShowConfigEditor(false)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                >
                  <X size={16} />
                  Close
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-4 overflow-hidden">
              <div className="mb-3">
                <p className="text-sm text-gray-400">
                  Edit the MCP server configuration. This JSON file defines
                  which MCP servers to connect to and their settings.
                </p>
              </div>
              <div className="h-96">
                <CodeEditor
                  value={configContent}
                  onChange={setConfigContent}
                  language="json"
                  height="100%"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
