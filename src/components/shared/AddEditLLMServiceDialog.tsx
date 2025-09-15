import { useState, useEffect } from 'react';
import { Check, X, Server, Eye, EyeOff } from 'lucide-react';
import { BaseDialog } from './BaseDialog';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';

export interface LLMServiceFormData {
  name: string;
  type: 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'perplexity' | 'google';
  baseURL: string;
  apiKey: string;
}

interface AddEditLLMServiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LLMServiceFormData) => void;
  editingService?: LLMServiceFormData | null;
  title?: string;
}

export function AddEditLLMServiceDialog({
  isOpen,
  onClose,
  onSave,
  editingService = null,
  title
}: AddEditLLMServiceDialogProps) {
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(isOpen, onClose);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState<LLMServiceFormData>({
    name: '',
    type: 'ollama',
    baseURL: '',
    apiKey: ''
  });

  const isEditing = !!editingService;
  const dialogTitle = title || (isEditing ? 'Edit LLM Service' : 'Add Custom LLM Service');

  useEffect(() => {
    if (editingService) {
      setFormData(editingService);
    } else {
      setFormData({
        name: '',
        type: 'ollama',
        baseURL: '',
        apiKey: ''
      });
    }
    setShowApiKey(false);
  }, [editingService, isOpen]);

  if (!shouldRender) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    handleClose();
  };

  const getPlaceholderForType = (type: string) => {
    switch (type) {
      case 'ollama':
        return 'http://localhost:11434';
      case 'vllm':
        return 'http://localhost:8000';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
      return 'https://api.anthropic.com';
    case 'perplexity':
      return 'https://api.perplexity.ai';
    case 'google':
      return 'https://generativelanguage.googleapis.com';
      case 'openai-compatible':
        return 'http://localhost:8080/v1';
      default:
        return 'http://localhost:8080';
    }
  };

  const requiresApiKey = (type: string) => {
    return ['openai', 'anthropic', 'perplexity', 'google'].includes(type);
  };

  return (
    <BaseDialog isOpen={shouldRender} onClose={handleClose} isVisible={isVisible} maxWidth="max-w-2xl">
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Server size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">{dialogTitle}</h3>
            <p className="text-sm text-gray-400">
              {isEditing ? 'Update service configuration' : 'Configure your LLM service connection'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Service Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., My Local Ollama"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Service Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  type: e.target.value as LLMServiceFormData['type'],
                  baseURL: getPlaceholderForType(e.target.value)
                })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ollama">Ollama</option>
                <option value="vllm">vLLM</option>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="perplexity">Perplexity</option>
                <option value="google">Google Generative AI</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Base URL *
            </label>
            <input
              type="url"
              value={formData.baseURL}
              onChange={(e) => setFormData({ ...formData, baseURL: e.target.value })}
              placeholder={getPlaceholderForType(formData.type)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Key {requiresApiKey(formData.type) ? '*' : '(optional)'}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Enter API key if required"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required={requiresApiKey(formData.type)}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex space-x-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white text-sm transition-colors"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors"
            >
              <Check size={14} />
              {isEditing ? 'Update Service' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </BaseDialog>
  );
}
