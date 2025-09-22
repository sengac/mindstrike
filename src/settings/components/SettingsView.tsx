import React, { useState } from 'react';
import {
  Settings,
  Cpu,
  Plus,
  Trash2,
  RefreshCw,
  TestTube,
  Eye,
  EyeOff,
  Edit2,
  Minus,
  Type,
  HardDrive,
  Info,
} from 'lucide-react';
import { fontSchemes } from '../../utils/fontSchemes';
import { AppBar } from '../../components/AppBar';
import { useCustomServices, CustomLLMService } from '../../hooks/useModels';
import { useAppStore } from '../../store/useAppStore';
import { LocalLLMManager } from './LocalLLMManager';
import {
  AddEditLLMServiceDialog,
  LLMServiceFormData,
} from '../../components/shared/AddEditLLMServiceDialog';
import toast from 'react-hot-toast';
import { MusicVisualization } from '../../components/MusicVisualization';

interface ServiceCardProps {
  service: CustomLLMService;
  isCustom: boolean;
  onEdit: (service: CustomLLMService) => void;
  handleTestService: (service: CustomLLMService) => void;
  removeService: (id: string) => void;
  testingService: string | null;
  showApiKeys: Set<string>;
  toggleApiKeyVisibility: (id: string) => void;
}

const ServiceCard = React.memo<ServiceCardProps>(
  ({
    service,
    isCustom,
    onEdit,
    handleTestService,
    removeService,
    testingService,
    showApiKeys,
    toggleApiKeyVisibility,
  }) => (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Cpu size={16} className="text-blue-400" />
            <h3 className="text-white font-medium">{service.name}</h3>
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                service.enabled
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
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
                  {showApiKeys.has(service.id)
                    ? service.apiKey
                    : '•'.repeat(20)}
                </span>
                <button
                  onClick={() => toggleApiKeyVisibility(service.id)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  {showApiKeys.has(service.id) ? (
                    <EyeOff size={12} />
                  ) : (
                    <Eye size={12} />
                  )}
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
                onClick={() => onEdit(service)}
                className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-blue-400"
                title="Edit service"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => removeService(service.id)}
                className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-red-400"
                title="Remove service"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
);

type SettingsTab = 'builtin-llm' | 'external-llm' | 'general-preferences';

export function SettingsView() {
  const {
    services,
    isLoading,
    addService,
    removeService,
    updateService,
    testService,
    refetch,
  } = useCustomServices();
  const {
    fontSize,
    increaseFontSize,
    decreaseFontSize,
    fontScheme,
    setFontScheme,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('builtin-llm');
  const [showAddEditDialog, setShowAddEditDialog] = useState(false);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<Set<string>>(new Set());
  const [editingService, setEditingService] = useState<CustomLLMService | null>(
    null
  );

  const handleSaveService = async (data: LLMServiceFormData) => {
    if (!data.name.trim() || !data.baseURL.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (editingService) {
        // Update existing service
        updateService(editingService.id, {
          name: data.name.trim(),
          baseURL: data.baseURL.trim(),
          type: data.type,
          apiKey: data.apiKey.trim() || undefined,
          enabled: true,
        });
        toast.success('LLM service updated successfully');
      } else {
        // Add new service
        addService({
          name: data.name.trim(),
          baseURL: data.baseURL.trim(),
          type: data.type,
          apiKey: data.apiKey.trim() || undefined,
          enabled: true,
        });
        toast.success('LLM service added successfully');
      }

      setEditingService(null);
    } catch {
      toast.error(
        editingService
          ? 'Failed to update LLM service'
          : 'Failed to add LLM service'
      );
    }
  };

  const handleOpenAddDialog = () => {
    setEditingService(null);
    setShowAddEditDialog(true);
  };

  const handleOpenEditDialog = (service: CustomLLMService) => {
    setEditingService(service);
    setShowAddEditDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddEditDialog(false);
    setEditingService(null);
  };

  const handleTestService = async (service: CustomLLMService) => {
    setTestingService(service.id);
    try {
      const result = await testService(service);
      if (result.success) {
        toast.success(
          `✓ Connection successful! Found ${result.models?.length || 0} models`
        );
      } else {
        toast.error(`✗ Connection failed: ${result.error}`);
      }
    } catch {
      toast.error('Test failed');
    } finally {
      setTestingService(null);
    }
  };

  const handleRescan = async () => {
    try {
      const response = await fetch('/api/llm/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to rescan services');
      }

      const result = await response.json();

      // Refresh the services list
      await refetch();

      const addedCount = result.addedServices?.length || 0;
      const removedCount = result.removedServices?.length || 0;
      const availableCount =
        result.scannedServices?.filter((s: any) => s.available)?.length || 0;

      if (addedCount > 0 || removedCount > 0) {
        const messages = [];
        if (addedCount > 0) {
          const serviceNames = result.addedServices
            .map((s: any) => s.name)
            .join(', ');
          messages.push(`Added: ${serviceNames}`);
        }
        if (removedCount > 0) {
          const serviceNames = result.removedServices
            .map((s: any) => s.name)
            .join(', ');
          messages.push(`Removed: ${serviceNames}`);
        }
        toast.success(`Rescan complete! ${messages.join(' • ')}`);
      } else if (availableCount > 0) {
        toast.success(
          `Rescan complete! Found ${availableCount} available service(s)`
        );
      } else {
        toast.success('Rescan complete! No services found');
      }
    } catch (error) {
      console.error('Rescan error:', error);
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

  return (
    <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
      {/* Header */}
      <AppBar icon={Settings} title="Settings" />

      {/* Tab Navigation */}
      <div className="border-b border-gray-700">
        <div className="px-6">
          <nav className="flex space-x-8">
            {[
              { id: 'builtin-llm', label: 'Built-in LLM', icon: HardDrive },
              { id: 'external-llm', label: 'LLM Services', icon: Cpu },
              {
                id: 'general-preferences',
                label: 'General Preferences',
                icon: Settings,
              },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto p-6">
        <MusicVisualization className="absolute inset-0 w-full h-full pointer-events-none z-0" />
        <div className="relative z-10">
          <div className="max-w-4xl space-y-8">
            {/* Built-in LLM Tab */}
            {activeTab === 'builtin-llm' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <Cpu size={20} className="text-green-400" />
                  <h2 className="text-lg font-medium text-white">
                    Built-in LLM Models
                  </h2>
                </div>

                {/* Info Notice */}
                <div className="p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-blue-400 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-blue-200 mb-2">
                        <strong>Built-in LLM Models:</strong> These models run
                        directly on your machine.
                      </p>
                      <ul className="text-blue-300 space-y-1 text-xs">
                        <li>
                          • Models are downloaded to ~/.mindstrike/local-models/
                        </li>
                        <li>• Loaded models consume system RAM</li>
                        <li>
                          • Q4_K_M quantization provides good
                          quality/performance balance
                        </li>
                        <li>
                          • Larger models provide better quality but require
                          more resources
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <LocalLLMManager />
              </div>
            )}

            {/* External LLM Tab */}
            {activeTab === 'external-llm' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Cpu size={20} className="text-blue-400" />
                    <h2 className="text-lg font-medium text-white">
                      LLM Services
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRescan}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
                      title="Rescan for local services (Ollama, vLLM, etc.)"
                    >
                      <RefreshCw size={14} />
                      Rescan
                    </button>
                    <button
                      onClick={handleOpenAddDialog}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
                    >
                      <Plus size={14} />
                      Add Service
                    </button>
                  </div>
                </div>

                {/* Info Notice */}
                <div className="p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-blue-400 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-blue-200 mb-2">
                        <strong>LLM Services:</strong> Connect to local and
                        remote AI services.
                      </p>
                      <ul className="text-blue-300 space-y-1 text-xs">
                        <li>
                          • Use "Rescan" to automatically detect local services
                          (Ollama, vLLM, etc.)
                        </li>
                        <li>
                          • Manually add LLM services like OpenAI, Anthropic,
                          Perplexity, Google, or custom endpoints
                        </li>
                        <li>
                          • API keys are stored securely and sent only to
                          specified endpoints
                        </li>
                        <li>
                          • Local services run on your machine, LLM services
                          require internet
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Custom Services */}
                {services.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-white">
                      Service Details
                    </h3>
                    <div className="space-y-3">
                      {services.map((service: CustomLLMService) => (
                        <ServiceCard
                          key={service.id}
                          service={service}
                          isCustom={true}
                          onEdit={handleOpenEditDialog}
                          handleTestService={handleTestService}
                          removeService={removeService}
                          testingService={testingService}
                          showApiKeys={showApiKeys}
                          toggleApiKeyVisibility={toggleApiKeyVisibility}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State for LLM Services */}
                {!isLoading && services.length === 0 && (
                  <div className="text-center py-12">
                    <Cpu size={48} className="text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-400 mb-2">
                      No LLM Services
                    </h3>
                    <p className="text-gray-500 mb-4">
                      Add LLM services (OpenAI, Anthropic, Perplexity, Google,
                      etc.) to get started.
                    </p>
                    <button
                      onClick={() => setShowAddEditDialog(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                    >
                      <Plus size={16} />
                      Add Your First Service
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* General Preferences Tab */}
            {activeTab === 'general-preferences' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <Type size={20} className="text-green-400" />
                  <h2 className="text-lg font-medium text-white">
                    General Preferences
                  </h2>
                </div>

                {/* Info Notice */}
                <div className="p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-blue-400 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-blue-200 mb-2">
                        <strong>General Preferences:</strong> Configure
                        application-wide settings.
                      </p>
                      <ul className="text-blue-300 space-y-1 text-xs">
                        <li>• Customize the interface for better usability</li>
                        <li>• Accessibility options to improve readability</li>
                        <li>
                          • Settings are saved automatically and persist across
                          sessions
                        </li>
                        <li>
                          • Changes take effect immediately without requiring a
                          restart
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-medium mb-1">
                          Font Size
                        </h3>
                        <p className="text-sm text-gray-400">
                          Adjust the text size for better readability
                        </p>
                      </div>
                      <div className="flex items-center space-x-1 bg-gray-700 rounded-lg p-1">
                        <button
                          onClick={decreaseFontSize}
                          className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-400 hover:text-gray-200"
                          title="Decrease font size"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="text-sm text-gray-300 px-3 min-w-[60px] text-center">
                          {fontSize}px
                        </span>
                        <button
                          onClick={increaseFontSize}
                          className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-400 hover:text-gray-200"
                          title="Increase font size"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium mb-1">
                        Font Scheme
                      </h3>
                      <p className="text-sm text-gray-400">
                        Choose a font scheme for markdown content
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={fontScheme}
                        onChange={e =>
                          setFontScheme(
                            e.target.value as
                              | 'system'
                              | 'inter'
                              | 'serif'
                              | 'monospace'
                              | 'academic'
                          )
                        }
                        className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {Object.entries(fontSchemes).map(([key, scheme]) => (
                          <option key={key} value={key}>
                            {scheme.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {fontSchemes[fontScheme]?.description}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit LLM Service Dialog */}
      <AddEditLLMServiceDialog
        isOpen={showAddEditDialog}
        onClose={handleCloseDialog}
        onSave={handleSaveService}
        editingService={
          editingService && editingService.type !== 'local'
            ? {
                name: editingService.name,
                type: editingService.type as LLMServiceFormData['type'],
                baseURL: editingService.baseURL,
                apiKey: editingService.apiKey || '',
              }
            : null
        }
      />
    </div>
  );
}
