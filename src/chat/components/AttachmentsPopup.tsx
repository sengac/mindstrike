import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, Paperclip, ImageIcon } from 'lucide-react';

interface AttachmentsPopupProps {
  onImageUpload?: (files: FileList) => void;
  isLoading?: boolean;
  isLocalModel?: boolean;
}

const AttachmentsPopup: React.FC<AttachmentsPopupProps> = ({
  onImageUpload,
  isLoading = false,
  isLocalModel = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && onImageUpload) {
      onImageUpload(files);
    }
    setIsOpen(false);
  };

  const handleAttachImages = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 bg-gray-600 hover:bg-gray-700 rounded-md transition-colors text-white flex items-center gap-1"
        title="Attachments"
      >
        <Paperclip size={14} />
        <ChevronUp
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-0 mb-2 w-80 bg-dark-bg border border-gray-600 rounded-lg shadow-lg z-50"
        >
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip size={16} className="text-gray-400" />
              <h3 className="text-sm font-medium text-gray-200">Attachments</h3>
            </div>

            <div className="space-y-2">
              <div className="relative group">
                <button
                  onClick={handleAttachImages}
                  disabled={isLoading || isLocalModel}
                  className="w-full flex items-center gap-3 p-3 bg-dark-hover hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors text-left group"
                >
                  <div className="flex-shrink-0 text-blue-400 group-hover:text-blue-300 group-disabled:text-gray-500">
                    <ImageIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 group-hover:text-white group-disabled:text-gray-500">
                      Attach Images
                    </div>
                    <div className="text-xs text-gray-400 group-disabled:text-gray-600 truncate">
                      {isLocalModel
                        ? 'Not available for built-in models'
                        : 'Upload images to chat'}
                    </div>
                  </div>
                </button>
                {isLocalModel && (
                  <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-yellow-300 text-sm rounded-lg shadow-lg border border-gray-600 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                    <div className="flex items-center gap-2">
                      <ImageIcon size={12} className="text-yellow-400" />
                      <span>
                        Multimodal support is not available for built-in models
                      </span>
                    </div>
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
};

export default AttachmentsPopup;
