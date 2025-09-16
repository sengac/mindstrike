/**
 * Shared utilities for encoding/decoding SSE data with base64 and large content support
 */

/**
 * Decode base64 encoded SSE data, handling UTF-8 properly
 */
export async function decodeSseData(obj: any): Promise<any> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj._base64 && typeof obj.data === 'string') {
    // Properly decode UTF-8 base64 string
    const bytes = Uint8Array.from(atob(obj.data), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  
  if (obj._large_content && obj.contentId) {
    try {
      const response = await fetch(`/api/large-content/${obj.contentId}`);
      if (response.ok) {
        const data = await response.json();
        return data.content;
      } else {
        return `[Large content not available - ${obj.length} characters]`;
      }
    } catch (error) {
      console.error('Failed to fetch large content:', error);
      return `[Large content error - ${obj.length} characters]`;
    }
  }
  
  if (Array.isArray(obj)) {
    const results = await Promise.all(obj.map(item => decodeSseData(item)));
    return results;
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = await decodeSseData(value);
  }
  return result;
}

/**
 * Synchronous version for simple cases where no large content is expected
 */
export function decodeSseDataSync(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj._base64 && typeof obj.data === 'string') {
    // Properly decode UTF-8 base64 string
    const bytes = Uint8Array.from(atob(obj.data), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  
  if (obj._large_content && obj.contentId) {
    return `[Large content - ${obj.length} characters]`;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => decodeSseDataSync(item));
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = decodeSseDataSync(value);
  }
  return result;
}
