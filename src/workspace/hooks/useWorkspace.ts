import { useState, useCallback } from 'react';

export function useWorkspace() {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentDirectory, setCurrentDirectory] = useState<string>('.');

  const loadDirectory = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/directory');
      if (response.ok) {
        const data = await response.json();
        setCurrentDirectory(data.currentDirectory);
      }
    } catch (error) {
      console.error('Failed to load current directory:', error);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/workspace/files');
      if (response.ok) {
        const fileList = await response.json();
        setFiles(fileList);
      } else {
        console.error('Failed to load files');
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const changeDirectory = useCallback(async (newPath: string, onDirectoryChange?: () => void) => {
    try {
      const response = await fetch('/api/workspace/directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: newPath })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentDirectory(data.currentDirectory);
        await loadFiles(); // Reload files for new directory
        
        // Trigger conversations rescan if callback provided
        if (onDirectoryChange) {
          onDirectoryChange();
        }
        
        return { success: true };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to change directory' };
    }
  }, [loadFiles]);

  const setWorkspaceRoot = useCallback(async (newPath?: string, onWorkspaceChange?: () => void) => {
    try {
      // If no path provided, use current working directory
      const pathToSet = newPath || '.';
      
      const response = await fetch('/api/workspace/root', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: pathToSet })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentDirectory('.'); // Reset to root of new workspace
        await loadDirectory(); // Reload directory info
        await loadFiles(); // Reload files for new workspace
        
        // Trigger conversations rescan if callback provided
        if (onWorkspaceChange) {
          onWorkspaceChange();
        }
        
        return { success: true, message: data.message };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to set workspace root' };
    }
  }, [loadDirectory, loadFiles]);

  const getFileContent = useCallback(async (filePath: string): Promise<string> => {
    const response = await fetch(`/api/workspace/file/${encodeURIComponent(filePath)}`);
    if (response.ok) {
      const data = await response.json();
      return data.content || '';
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load file');
    }
  }, []);

  return {
    files,
    isLoading,
    currentDirectory,
    loadFiles,
    loadDirectory,
    changeDirectory,
    setWorkspaceRoot,
    getFileContent
  };
}
