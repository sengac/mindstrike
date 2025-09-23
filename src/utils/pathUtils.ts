/**
 * Cross-platform path utilities for frontend use
 */

/**
 * Joins path segments, handling different OS path separators
 * @param segments Path segments to join
 * @returns Joined path
 */
export function joinPath(...segments: string[]): string {
  if (segments.length === 0) {
    return '';
  }

  // Filter out empty segments
  const validSegments = segments.filter(
    segment => segment && segment.length > 0
  );
  if (validSegments.length === 0) {
    return '';
  }

  const first = validSegments[0];
  const rest = validSegments.slice(1);

  // Handle relative root case
  if (first === '.') {
    if (rest.length === 0) {
      return '.';
    }
    return rest.join('/');
  }

  // Handle Windows drive letters (C:, D:, etc.)
  const isWindowsRoot = /^[A-Za-z]:$/.test(first);
  const isWindowsRootWithSlash = /^[A-Za-z]:[/\\]$/.test(first);
  const isUnixRoot = first === '/';

  if (isWindowsRoot) {
    // For Windows root (C:), join with forward slashes for web compatibility
    if (rest.length === 0) {
      return first;
    }
    return [first, ...rest].join('/');
  }

  if (isWindowsRootWithSlash) {
    // For Windows root with slash (C:/ or C:\), normalize and join
    const normalizedRoot = first.replace(/[/\\]$/, ''); // Remove trailing slash
    if (rest.length === 0) {
      return normalizedRoot;
    }
    return [normalizedRoot, ...rest].join('/');
  }

  if (isUnixRoot) {
    // For Unix root (/), avoid double slashes
    if (rest.length === 0) {
      return '/';
    }
    return '/' + rest.join('/');
  }

  // For normal paths, just join with forward slashes
  return validSegments.join('/');
}

/**
 * Checks if a path is a root directory
 * @param path Path to check
 * @returns True if path is a root directory
 */
export function isRootPath(path: string): boolean {
  // Unix root
  if (path === '/') {
    return true;
  }

  // Windows root (C:, D:, etc.)
  if (/^[A-Za-z]:$/.test(path)) {
    return true;
  }

  // Windows root with slash (C:\, D:\, etc.) - normalize to forward slash
  if (/^[A-Za-z]:[/\\]$/.test(path)) {
    return true;
  }

  // Relative root
  if (path === '.') {
    return true;
  }

  return false;
}

/**
 * Normalizes a path to use forward slashes (for web compatibility)
 * @param path Path to normalize
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Gets the appropriate path separator for the current platform
 * @param _path Sample path to detect separator from (unused in web context)
 * @returns Path separator ('/' for web compatibility)
 */
export function getPathSeparator(_path: string): string {
  // For web/frontend, always use forward slash
  // The server will handle the actual OS-specific paths
  return '/';
}
