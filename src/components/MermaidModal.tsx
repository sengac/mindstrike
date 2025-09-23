import { X, Maximize2, Loader2, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import { MERMAID_CONFIG } from '../utils/mermaidConfig';
import { useDialogAnimation } from '../hooks/useDialogAnimation';
import { logger } from '../utils/logger';

interface MermaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  mermaidCode: string;
}

export function MermaidModal({
  isOpen,
  onClose,
  mermaidCode,
}: MermaidModalProps) {
  const [modalId, setModalId] = useState('');
  const [isRendering, setIsRendering] = useState(true);
  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  );

  useEffect(() => {
    if (isOpen && mermaidCode) {
      const id = `modal-mermaid-${Date.now()}-${Math.random()}`;
      setModalId(id);
      setIsRendering(true);

      // Simple direct rendering approach
      const renderMermaid = async () => {
        try {
          // Initialize mermaid with our config
          mermaid.initialize(MERMAID_CONFIG);

          // Wait for DOM to be ready
          await new Promise(resolve => setTimeout(resolve, 100));

          const element = document.getElementById(id);
          if (!element) {
            setIsRendering(false);
            return;
          }

          // Clean the mermaid code (remove style overrides)
          const cleanCode = mermaidCode
            .replace(/style\s+\w+\s+fill:[^,\n]+/g, '')
            .replace(/style\s+\w+\s+[^,\n]+/g, '')
            .replace(/\n\s*\n/g, '\n')
            .trim();

          // Set the code as text content
          element.textContent = cleanCode;

          // Render with mermaid
          await mermaid.run({
            nodes: [element],
          });

          // Scale the SVG to fit the container
          const svg = element.querySelector('svg');
          if (svg) {
            svg.style.maxWidth = '100%';
            svg.style.maxHeight = '100%';
            svg.style.width = 'auto';
            svg.style.height = 'auto';
          }

          setIsRendering(false);
        } catch (error) {
          logger.error('Modal mermaid rendering failed:', error);
          setIsRendering(false);
        }
      };

      renderMermaid();
    }
  }, [isOpen, mermaidCode]);

  const downloadMermaidDiagram = async () => {
    try {
      const diagramElement = document.getElementById(modalId);
      if (!diagramElement) {
        return;
      }

      const svgElement = diagramElement.querySelector('svg');
      if (!svgElement) {
        return;
      }

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
      logger.error('Failed to download diagram:', err);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
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
  }, [isOpen, handleClose]);

  if (!shouldRender) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Modal */}
      <div
        className={`
        relative bg-gray-900 w-[100vw] h-[100vh] flex flex-col
        transition-all duration-200 ease-out
        ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
      `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <Maximize2 size={16} className="text-blue-400" />
            <h2 className="text-lg font-semibold text-white">
              Full Screen Diagram
            </h2>
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
              onClick={handleClose}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
              title="Close modal"
            >
              <X size={16} className="text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="bg-gray-900 flex-1 overflow-hidden relative flex items-center justify-center">
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
              style={{
                opacity: isRendering ? 0 : 1,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Content will be set by the rendering effect */}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
