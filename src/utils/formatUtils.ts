/**
 * Format size in bytes to human readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format size in bytes to human readable format with integer values
 */
export function formatBytesInteger(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  if (i === 0) {
    return `${bytes} B`;
  } else if (i === sizes.length - 1) {
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  } else {
    return `${Math.round(bytes / Math.pow(k, i))} ${sizes[i]}`;
  }
}
