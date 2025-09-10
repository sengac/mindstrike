import React, { useState } from 'react';
import { Settings, Cpu, Plus, Trash2, RefreshCw, TestTube, Check, X, Eye, EyeOff, Edit2 } from 'lucide-react';
import { useLlmServices, CustomLLMService } from '../hooks/useLlmServices';
import toast from 'react-hot-toast';

interface AddServiceFormData {
  name: string;
  baseURL: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai';
  apiKey: string;
}

export function SettingsPanel() {
  const { config, isLoading, error, addCustomService, removeCustomService, updateCustomService, testService, rescanServices } = useLlmServices();
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [formData, setFormData] = useState<AddServiceFormData>({
    name: '',
    baseURL: '',
    type: 'ollama',
    apiKey: ''
  });
  const [showApiKeys, setShowApiKeys] = useState<Set<string>>(new Set());
  const [editingService, setEditingService] = useState<string | null>(null);

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.baseURL.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      addCustomService({
        name: formData.name.trim(),
        baseURL: formData.baseURL.trim(),
        type: formData.type,
        apiKey: formData.apiKey.trim() || undefined,
        enabled: true
      });
      
      setFormData({ name: '', baseURL: '', type: 'ollama', apiKey: '' });
      setShowAddForm(false);
      toast.success('LLM service added successfully');
    } catch (error) {
      toast.error('Failed to add LLM service');
    }
  };

  const handleTestService = async (service: CustomLLMService) => {
    setTestingService(service.id);
    try {
      const result = await testService(service);
      if (result.success) {
        toast.success(`✓ Connection successful! Found ${result.models?.length || 0} models`);
      } else {
        toast.error(`✗ Connection failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Test failed');
    } finally {
      setTestingService(null);
    }
  };

  const handleRescan = async () => {
    try {
      await rescanServices();
      toast.success('Rescanned for available services');
    } catch (error) {
      toast.error('Failed to rescan services');
    }
  };

  const toggleApiKeyVisibility = (serviceId: string) => {
    const newSet = new Set(showApiKeys);
    if (newSet.has(serviceId)) {
      newSet.delete(serviceId);
    } else {
      newSet.add(serviceId);
    }
    setShowApiKeys(newSet);
  };

  const handleUpdateService = (serviceId: string, field: keyof CustomLLMService, value: any) => {
    updateCustomService(serviceId, { [field]: value });
  };

  const ServiceCard = ({ service, isCustom }: { service: CustomLLMService; isCustom: boolean }) => (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Cpu size={16} className="text-blue-400" />
            <h3 className="text-white font-medium">{service.name}</h3>
            <span className={`px-2 py-1 text-xs rounded-full ${
              service.enabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}>
              {service.enabled ? 'Available' : 'Offline'}
            </span>
            <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
              {service.type}
            </span>
            {isCustom && (
              <span className="px-2 py-1 text-xs bg-purple-600 text-white rounded-full">
                Custom
              </span>
            )}
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-16">URL:</span>
              <span className="text-gray-300 font-mono">{service.baseURL}</span>
            </div>
            
            {service.apiKey && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 w-16">API Key:</span>
                <span className="text-gray-300 font-mono">
                  {showApiKeys.has(service.id) ? service.apiKey : '•'.repeat(20)}
                </span>
                <button
                  onClick={() => toggleApiKeyVisibility(service.id)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  {showApiKeys.has(service.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => handleTestService(service)}
            disabled={testingService === service.id}
            className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-green-400"
            title="Test connection"
          >
            {testingService === service.id ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <TestTube size={14} />
            )}
          </button>
          
          {isCustom && (
            <>
              <button
                onClick={() => setEditingService(editingService === service.id ? null : service.id)}
                className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-blue-400"
                title="Edit service"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => removeCustomService(service.id)}
                className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400"
                title="Remove service"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Edit form for custom services */}
      {isCustom && editingService === service.id && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                type="text"
                value={service.name}
                onChange={(e) => handleUpdateService(service.id, 'name', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
              <select
                value={service.type}
                onChange={(e) => handleUpdateService(service.id, 'type', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              >
                <option value="ollama">Ollama</option>
                <option value="vllm">vLLM</option>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Base URL</label>
              <input
                type="url"
                value={service.baseURL}
                onChange={(e) => handleUpdateService(service.id, 'baseURL', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">API Key (optional)</label>
              <input
                type="password"
                value={service.apiKey || ''}
                onChange={(e) => handleUpdateService(service.id, 'apiKey', e.target.value || undefined)}
                placeholder="Enter API key if required"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 border-b border-gray-700 flex items-center" style={{height: 'var(--header-height)'}}>
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-blue-400" />
          <h1 className="text-xl font-semibold text-white">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-8">
          {/* LLM Configuration Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu size={20} className="text-blue-400" />
                <h2 className="text-lg font-medium text-white">LLM Services</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRescan}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
                  title="Rescan for available services"
                >
                  <RefreshCw size={14} />
                  Rescan
                </button>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
                >
                  <Plus size={14} />
                  Add Service
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Add Service Form */}
            {showAddForm && (
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                <h3 className="text-white font-medium mb-4">Add Custom LLM Service</h3>
                <form onSubmit={handleAddService} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Service Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., My Local Ollama"
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Service Type
                      </label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      >
                        <option value="ollama">Ollama</option>
                        <option value="vllm">vLLM</option>
                        <option value="openai-compatible">OpenAI Compatible</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Base URL *
                    </label>
                    <input
                      type="url"
                      value={formData.baseURL}
                      onChange={(e) => setFormData({ ...formData, baseURL: e.target.value })}
                      placeholder="e.g., http://localhost:11434"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      API Key (optional)
                    </label>
                    <input
                      type="password"
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      placeholder="Enter API key if required"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm transition-colors"
                    >
                      <Check size={14} />
                      Add Service
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white text-sm transition-colors"
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Detected Services */}
            {config.detectedServices.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-md font-medium text-white">Detected Services</h3>
                <div className="space-y-3">
                  {config.detectedServices.map((service) => (
                    <ServiceCard key={service.id} service={service} isCustom={false} />
                  ))}
                </div>
              </div>
            )}

            {/* Custom Services */}
            {config.customServices.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-md font-medium text-white">Custom Services</h3>
                <div className="space-y-3">
                  {config.customServices.map((service) => (
                    <ServiceCard key={service.id} service={service} isCustom={true} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && config.detectedServices.length === 0 && config.customServices.length === 0 && (
              <div className="text-center py-12">
                <Cpu size={48} className="text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-400 mb-2">No LLM Services Found</h3>
                <p className="text-gray-500 mb-4">
                  No LLM services were detected automatically. Add a custom service to get started.
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                >
                  <Plus size={16} />
                  Add Your First Service
                </button>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-8">
                <RefreshCw size={24} className="text-blue-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">Loading LLM services...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
