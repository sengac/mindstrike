import { useState, useEffect, useRef } from 'react';
import {
  File,
  Folder,
  RefreshCw,
  Edit3,
  Save,
  Trash2,
  FolderOpen,
  ArrowUp,
  Home,
  Music,
} from 'lucide-react';
import { AppBar } from '../../components/AppBar';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';
import { CodeEditor } from './CodeEditor';
import { TabbedEditor } from './TabbedEditor';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import toast from 'react-hot-toast';

interface FileExplorerProps {
  onDirectoryChange?: () => void;
}

export function FileExplorer({ onDirectoryChange }: FileExplorerProps) {
  const {
    files,
    loadFiles,
    loadDirectory,
    changeDirectory,
    setWorkspaceRoot,
    setMusicRoot,
    currentDirectory,
    getFileContent,
    isLoading,
  } = useWorkspaceStore();
  const hasLoadedInitialDirectory = useRef(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string>('');
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [newDirectoryPath, setNewDirectoryPath] = useState('');

  // Dialog state management
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDirectoryInput, setShowDirectoryInput] = useState(false);

  // Dialog animation hooks
  const {
    shouldRender: shouldRenderDeleteDialog,
    isVisible: isDeleteDialogVisible,
    handleClose: closeDeleteDialog,
  } = useDialogAnimation(showDeleteDialog, () => setShowDeleteDialog(false));

  const {
    shouldRender: shouldRenderDirectoryInput,
    isVisible: isDirectoryInputVisible,
    handleClose: closeDirectoryInput,
  } = useDialogAnimation(showDirectoryInput, () =>
    setShowDirectoryInput(false)
  );

  const openDeleteDialog = () => setShowDeleteDialog(true);
  const openDirectoryInput = () => setShowDirectoryInput(true);

  const [showWorkspaceConfirm, setShowWorkspaceConfirm] = useState(false);
  const [showMusicConfirm, setShowMusicConfirm] = useState(false);

  const openWorkspaceConfirm = () => setShowWorkspaceConfirm(true);
  const closeWorkspaceConfirm = () => setShowWorkspaceConfirm(false);
  const openMusicConfirm = () => setShowMusicConfirm(true);
  const closeMusicConfirm = () => setShowMusicConfirm(false);

  useEffect(() => {
    loadDirectory();
    loadFiles();
  }, [loadDirectory, loadFiles]);

  // Note: Workspace restoration is now handled at the App level

  // Set flag after initial load (removed automatic directory saving)
  useEffect(() => {
    if (currentDirectory) {
      if (!hasLoadedInitialDirectory.current) {
        hasLoadedInitialDirectory.current = true;
      }
    }
  }, [currentDirectory]);

  const handleFileClick = async (filePath: string) => {
    if (filePath.endsWith('/')) {
      // Navigate to directory
      const dirName = filePath.slice(0, -1);
      const newPath =
        currentDirectory === '.' ? dirName : `${currentDirectory}/${dirName}`;
      const result = await changeDirectory(newPath, onDirectoryChange);
      if (!result.success) {
        toast.error(`Failed to change directory: ${result.error}`);
      }
      return;
    }

    setSelectedFile(filePath);
    setLoadingContent(true);
    setIsEditing(false);

    try {
      const content = await getFileContent(filePath);
      setFileContent(content);
      setEditedContent(content);
    } catch (error) {
      setFileContent(`Error loading file: ${error}`);
      setEditedContent('');
    } finally {
      setLoadingContent(false);
    }
  };

  const getLanguageFromExtension = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
        return 'typescript';
      case 'tsx':
        return 'typescript';
      case 'js':
        return 'javascript';
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'java':
        return 'java';
      case 'c':
        return 'c';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'cs':
        return 'csharp';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'sql':
        return 'sql';
      case 'xml':
        return 'xml';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'sh':
        return 'shell';
      default:
        return 'plaintext';
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;

    try {
      // Construct full path relative to workspace root
      const fullPath =
        currentDirectory === '.'
          ? selectedFile
          : `${currentDirectory}/${selectedFile}`;
      const response = await fetch('/api/workspace/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: fullPath,
          content: editedContent,
        }),
      });

      if (response.ok) {
        setFileContent(editedContent);
        setIsEditing(false);
        // Optionally show success message
      } else {
        console.error('Failed to save file');
      }
    } catch (error) {
      console.error('Error saving file:', error);
    }
  };

  const handleDeleteClick = (filePath: string) => {
    setFileToDelete(filePath);
    openDeleteDialog();
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;

    try {
      // Construct full path relative to workspace root
      const fullPath =
        currentDirectory === '.'
          ? fileToDelete
          : `${currentDirectory}/${fileToDelete}`;
      const response = await fetch('/api/workspace/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: fullPath }),
      });

      if (response.ok) {
        // If the deleted file was selected, clear the selection
        if (selectedFile === fileToDelete) {
          setSelectedFile(null);
          setFileContent('');
          setEditedContent('');
          setIsEditing(false);
        }
        // Refresh the file list
        loadFiles();
        setFileToDelete(null);
      } else {
        const errorData = await response.json();
        console.error('Failed to delete file:', errorData.error);
        toast.error(`Failed to delete file: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Error deleting file');
    }
  };

  const handleGoUp = async () => {
    const result = await changeDirectory('..', onDirectoryChange);
    if (!result.success) {
      toast.error(`Failed to go up: ${result.error}`);
    }
  };

  const handleChangeDirectory = () => {
    setNewDirectoryPath(currentDirectory);
    openDirectoryInput();
  };

  const handleDirectorySubmit = async () => {
    if (!newDirectoryPath.trim()) return;

    const result = await changeDirectory(
      newDirectoryPath.trim(),
      onDirectoryChange
    );
    if (result.success) {
      closeDirectoryInput();
      setNewDirectoryPath('');
    } else {
      toast.error(`Failed to change directory: ${result.error}`);
    }
  };

  const handleDirectoryCancel = () => {
    closeDirectoryInput();
    setNewDirectoryPath('');
  };

  const handleSetWorkspaceRoot = () => {
    openWorkspaceConfirm();
  };

  const handleWorkspaceConfirm = async () => {
    closeWorkspaceConfirm();
    const result = await setWorkspaceRoot(currentDirectory, onDirectoryChange);
    if (result.success) {
      toast.success(
        `${result.message}\n\nThe current directory is now your workspace root. All workspace files will be saved here.`
      );
    } else {
      toast.error(`Failed to set workspace root: ${result.error}`);
    }
  };

  const handleSetMusicRoot = () => {
    openMusicConfirm();
  };

  const handleMusicConfirm = async () => {
    closeMusicConfirm();
    const result = await setMusicRoot(currentDirectory, onDirectoryChange);
    if (result.success) {
      toast.success(
        `${result.message}\n\nThe current directory is now your music root. All audio files will be served from here.`
      );
    } else {
      toast.error(`Failed to set music root: ${result.error}`);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <AppBar
        icon={Folder}
        title="Workspace"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleSetMusicRoot}
              className="px-4 py-1 border border-gray-600 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200 flex items-center gap-1"
              title="Set current directory as music root"
            >
              <Music size={16} className="text-gray-400" />
              <span className="text-xs">Set music root</span>
            </button>
            <button
              onClick={handleSetWorkspaceRoot}
              className="px-4 py-1 border border-gray-600 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200 flex items-center gap-1"
              title="Set current directory as workspace root"
            >
              <Home size={16} className="text-gray-400" />
              <span className="text-xs">Set workspace root</span>
            </button>
          </div>
        }
      />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* File list */}
        <div
          className="w-[20%] min-w-[200px] max-w-[500px] border-r border-gray-700 flex flex-col min-h-0"
          data-testid="workspace-slider"
        >
          <div className="flex items-center space-x-2 p-4">
            <button
              onClick={handleGoUp}
              className="p-1 rounded transition-colors text-gray-400 hover:bg-gray-800"
              title="Go up one directory"
            >
              <ArrowUp size={14} />
            </button>

            <button
              onClick={handleChangeDirectory}
              className="flex-1 text-left p-1 px-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors truncate text-sm"
              title="Click to change directory"
            >
              <span className="text-gray-300">{currentDirectory}</span>
            </button>

            <button
              onClick={loadFiles}
              disabled={isLoading}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw
                size={16}
                className={`text-gray-400 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="text-gray-500 text-sm p-2">Loading...</div>
            ) : (
              <div className="space-y-1">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className={`flex items-center group rounded text-sm transition-colors ${
                      selectedFile === file
                        ? 'bg-gray-800'
                        : 'hover:bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => handleFileClick(file)}
                      className="flex-1 text-left p-2 flex items-center space-x-2"
                    >
                      {file.endsWith('/') ? (
                        <>
                          <Folder
                            size={16}
                            className="text-blue-400 flex-shrink-0"
                          />
                          <span className="truncate">{file.slice(0, -1)}</span>
                        </>
                      ) : (
                        <>
                          <File
                            size={16}
                            className="text-gray-400 flex-shrink-0"
                          />
                          <span className="truncate">{file}</span>
                        </>
                      )}
                    </button>
                    {/* Delete button - only show for files, not directories */}
                    {!file.endsWith('/') && (
                      <button
                        onClick={() => handleDeleteClick(file)}
                        className="p-1 mr-2 opacity-0 group-hover:opacity-100 hover:bg-red-600 rounded transition-all"
                        title="Delete file"
                      >
                        <Trash2
                          size={14}
                          className="text-red-400 hover:text-white"
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* File content */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedFile ? (
            <>
              <div className="flex-shrink-0 border-b border-gray-700 p-4 flex items-center justify-between">
                <h3 className="font-medium truncate">{selectedFile}</h3>
                {/* Only show edit controls for non-markdown files */}
                {getLanguageFromExtension(selectedFile) !== 'markdown' && (
                  <div className="flex items-center space-x-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleSaveFile}
                          className="flex items-center space-x-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                        >
                          <Save size={14} />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditedContent(fileContent);
                          }}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                      >
                        <Edit3 size={14} />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                {loadingContent ? (
                  <div className="p-4 text-gray-500">Loading...</div>
                ) : (
                  (() => {
                    const language = getLanguageFromExtension(selectedFile);
                    const isMarkdown = language === 'markdown';

                    // Use tabbed editor for markdown files
                    if (isMarkdown) {
                      return (
                        <TabbedEditor
                          filePath={selectedFile}
                          content={fileContent}
                          language={language}
                          onSave={async content => {
                            setEditedContent(content);
                            setFileContent(content);

                            // Save to server
                            try {
                              // Construct full path relative to workspace root
                              const fullPath =
                                currentDirectory === '.'
                                  ? selectedFile
                                  : `${currentDirectory}/${selectedFile}`;
                              const response = await fetch(
                                '/api/workspace/save',
                                {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    path: fullPath,
                                    content,
                                  }),
                                }
                              );

                              if (!response.ok) {
                                console.error('Failed to save file');
                              }
                            } catch (error) {
                              console.error('Error saving file:', error);
                            }
                          }}
                        />
                      );
                    }

                    // Use regular code editor for other files
                    return (
                      <div className="h-full p-4">
                        <CodeEditor
                          value={isEditing ? editedContent : fileContent}
                          language={language}
                          onChange={isEditing ? setEditedContent : undefined}
                          readOnly={!isEditing}
                          height="100%"
                        />
                      </div>
                    );
                  })()
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="flex items-center justify-center">
                  <File size={16} className="mr-2" />
                  Select a file to view its contents
                </p>
                <p className="flex items-center justify-center mt-2">
                  <Home size={16} className="mr-2" />
                  Navigate to other directories and click the "Set workspace
                  root" button to change the workspace root
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {shouldRenderDeleteDialog && (
        <ConfirmDialog
          isOpen={isDeleteDialogVisible}
          onClose={closeDeleteDialog}
          onConfirm={handleDeleteConfirm}
          title="Delete File"
          message={`Are you sure you want to delete ${fileToDelete}?`}
          confirmText="Delete"
          type="danger"
        />
      )}

      {/* Directory Change Dialog */}
      {shouldRenderDirectoryInput && (
        <div
          className={`fixed inset-0 bg-black flex items-center justify-center z-50 transition-opacity duration-250 ease-out ${isDirectoryInputVisible ? 'bg-opacity-50' : 'bg-opacity-0'}`}
          onClick={closeDirectoryInput}
        >
          <div
            className={`bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4 transition-all duration-250 ease-out ${isDirectoryInputVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <FolderOpen size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">
                  Change Directory
                </h3>
                <p className="text-sm text-gray-400">
                  Enter the path to navigate to.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <input
                type="text"
                value={newDirectoryPath}
                onChange={e => setNewDirectoryPath(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleDirectorySubmit();
                  if (e.key === 'Escape') closeDirectoryInput();
                }}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                placeholder="Enter directory path (e.g., . or src or ../other-project)"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Use '.' for root, relative paths like 'src', or '..' to go up
              </p>
            </div>

            <div className="flex space-x-3 justify-end">
              <button
                onClick={handleDirectoryCancel}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDirectorySubmit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Root Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showWorkspaceConfirm}
        onClose={closeWorkspaceConfirm}
        onConfirm={handleWorkspaceConfirm}
        title="Set Workspace Root"
        message={`Are you sure you want to set ${currentDirectory} as your workspace root? All workspace files will be saved here.`}
        confirmText="Set Root"
        type="info"
        icon={<Home size={20} />}
      />

      {/* Music Root Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showMusicConfirm}
        onClose={closeMusicConfirm}
        onConfirm={handleMusicConfirm}
        title="Set Music Root"
        message={`Are you sure you want to set ${currentDirectory} as your music root? All audio files will be served from here.`}
        confirmText="Set Root"
        type="info"
        icon={<Music size={20} />}
      />
    </div>
  );
}
