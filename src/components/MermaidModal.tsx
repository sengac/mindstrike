import { X, Maximize2, Loader2, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  mermaidCode: string;
}

export function MermaidModal({ isOpen, onClose, mermaidCode }: MermaidModalProps) {
  const [modalId, setModalId] = useState('');
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const id = `modal-mermaid-${Date.now()}-${Math.random()}`;
      setModalId(id);
      setIsRendering(true);
      
      // Initialize mermaid for modal
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true
        },
        themeVariables: {
          darkMode: true,
          background: 'transparent',
          primaryColor: '#3b82f6',
          primaryTextColor: '#e5e7eb',
          primaryBorderColor: '#374151',
          lineColor: '#6b7280',
          secondaryColor: '#1f2937',
          tertiaryColor: '#111827',
          mainBkg: 'transparent',
          secondBkg: '#1f2937',
          tertiaryBkg: '#111827',
          nodeBkg: '#374151',
          nodeTextColor: '#e5e7eb',
          clusterBkg: '#1f2937',
          clusterTextColor: '#e5e7eb',
          fillType0: '#374151',
          fillType1: '#1f2937',
          fillType2: '#111827',
          fillType3: '#4b5563',
          fillType4: '#6b7280',
          fillType5: '#9ca3af',
          fillType6: '#d1d5db',
          fillType7: '#e5e7eb'
        }
      });

      // Render the diagram after a short delay to ensure DOM is ready
      setTimeout(async () => {
        const element = document.getElementById(id);
        if (element) {
          try {
            await mermaid.run({
              nodes: [element as HTMLElement]
            });
            setIsRendering(false);
          } catch (error) {
            console.error('Mermaid rendering error:', error);
            setIsRendering(false);
          }
        }
      }, 100);
    }
  }, [isOpen, mermaidCode]);

  const downloadMermaidDiagram = async () => {
    try {
      const diagramElement = document.getElementById(modalId);
      if (!diagramElement) return;

      const svgElement = diagramElement.querySelector('svg');
      if (!svgElement) return;

      // Get SVG string
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
      
      // Create download link
      const url = URL.createObjectURL(svgBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mermaid-diagram-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download diagram:', err);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-75 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gray-900 rounded-lg border border-gray-700 w-[98vw] h-[98vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <Maximize2 size={16} className="text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Full Screen Diagram</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={downloadMermaidDiagram}
              className="p-2 hover:bg-gray-700 rounded transition-colors flex items-center space-x-1"
              title="Download diagram"
              disabled={isRendering}
            >
              <Download size={16} className="text-gray-400 hover:text-white" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title="Close modal"
            >
              <X size={16} className="text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col">
          <div className="bg-gray-800 p-4 rounded border border-gray-700 flex-1 overflow-auto relative">
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <div className="flex items-center space-x-3">
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                  <span className="text-gray-300">Rendering diagram...</span>
                </div>
              </div>
            )}
            <div 
              id={modalId}
              className="mermaid"
              style={{ opacity: isRendering ? 0 : 1 }}
            >
              {mermaidCode}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
