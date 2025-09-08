import { useState, useCallback } from 'react';

export function useWorkspace() {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    loadFiles,
    getFileContent
  };
}
