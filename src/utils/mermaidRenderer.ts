import mermaid from 'mermaid';
import { MERMAID_CONFIG } from './mermaidConfig';

// Global flag to prevent multiple initializations
let isInitialized = false;

// Initialize Mermaid once globally
export function initializeMermaid() {
  if (!isInitialized) {
    mermaid.initialize(MERMAID_CONFIG);
    isInitialized = true;
  }
}

// Clean mermaid code by removing style overrides
export function cleanMermaidCode(code: string): string {
  return code
    .replace(/style\s+\w+\s+fill:[^,\n]+/g, '') // Remove fill styles
    .replace(/style\s+\w+\s+[^,\n]+/g, '') // Remove other styles
    .replace(/\n\s*\n/g, '\n') // Clean up extra blank lines
    .trim();
}

// Queue to prevent overlapping renders
let renderQueue = Promise.resolve();

// Global observer to catch dynamically added mermaid elements
const observedContainers = new WeakSet<HTMLElement>();

function setupMermaidObserver(container: HTMLElement) {
  if (observedContainers.has(container)) {
    return; // Already observing this container
  }
  
  observedContainers.add(container);
  
  const observer = new MutationObserver((mutations) => {
    let shouldRender = false;
    
    mutations.forEach((mutation) => {
      // Only check added nodes, ignore removed nodes to prevent rendering during unmount
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          // Only trigger if we added a mermaid element that isn't already rendered
          if (element.classList?.contains('mermaid') && !element.getAttribute('data-rendered')) {
            shouldRender = true;
          } else if (element.querySelector?.('.mermaid:not([data-rendered])')) {
            shouldRender = true;
          }
        }
      });
      
      // Check if text content changed in existing unrendered mermaid elements
      if (mutation.type === 'characterData' && mutation.target && mutation.target.parentElement) {
        const target = mutation.target.parentElement as HTMLElement;
        if (target.classList?.contains('mermaid') && !target.getAttribute('data-rendered')) {
          shouldRender = true;
        }
      }
    });
    
    if (shouldRender) {
      // Debounce the rendering to avoid excessive renders during React updates
      setTimeout(() => {
        // Double-check container is still connected before rendering
        if (container.isConnected) {
          renderMermaidDiagramsDelayed(container, false, () => {
            // Dispatch a custom event when mermaid rendering completes
            container.dispatchEvent(new CustomEvent('mermaidRenderComplete'));
          });
        }
      }, 100);
    }
  });
  
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Cleanup when container is removed
  const cleanupObserver = () => {
    observer.disconnect();
    observedContainers.delete(container);
  };
  
  // Store cleanup function on the container
  (container as any)._mermaidObserverCleanup = cleanupObserver;
}

// Single function to render all mermaid diagrams in a container
export async function renderMermaidDiagrams(container: HTMLElement, onComplete?: () => void): Promise<void> {
  // Queue the render to prevent race conditions
  renderQueue = renderQueue.then(async () => {
    // Ensure mermaid is initialized
    initializeMermaid();
    
    // Find all unrendered mermaid elements
    const mermaidElements = container.querySelectorAll('.mermaid:not([data-rendered])');
    
    if (mermaidElements.length === 0) {
      if (onComplete) {
        onComplete();
      }
      return;
    }

    // Process each mermaid element
    for (const element of Array.from(mermaidElements)) {
      const htmlElement = element as HTMLElement;
      
      try {
        // Validate element is still in DOM and accessible
        if (!htmlElement.isConnected || !htmlElement.parentElement) {
          continue; // Skip disconnected elements
        }

        // Get the mermaid code
        const code = htmlElement.getAttribute('data-mermaid-code') || htmlElement.textContent || '';
        
        if (!code.trim()) {
          htmlElement.setAttribute('data-rendered', 'empty');
          continue;
        }

        // Clean the code and set it as content
        const cleanCode = cleanMermaidCode(code);
        htmlElement.textContent = cleanCode;
        
        // Mark as being processed to prevent duplicate rendering
        htmlElement.setAttribute('data-rendered', 'processing');
        
        // Wait a frame to ensure DOM is settled
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Double-check element is still connected before rendering
        if (!htmlElement.isConnected || !htmlElement.parentElement) {
          continue; // Skip if element was removed during the wait
        }
        
        // Render the diagram
        await mermaid.run({
          nodes: [htmlElement]
        });
        
        // Mark as successfully rendered (only if still connected)
        if (htmlElement.isConnected) {
          htmlElement.setAttribute('data-rendered', 'true');
        }
        
      } catch (error) {
        // Only log errors for elements that are still in the DOM
        if (htmlElement.isConnected) {
          console.error('Mermaid rendering failed for element:', error);
          
          // Show error state with original code
          const originalCode = htmlElement.getAttribute('data-mermaid-code') || '';
          htmlElement.innerHTML = `<pre class="text-red-400 bg-red-900/20 p-2 rounded"><code>${originalCode}</code></pre>`;
          htmlElement.setAttribute('data-rendered', 'error');
        }
        // Silently ignore errors for disconnected elements
      }
    }
    
    // Call completion callback if provided
    if (onComplete) {
      onComplete();
    }
  });
  
  return renderQueue;
}

// Enhanced renderer that uses RequestAnimationFrame for better timing
export function renderMermaidDiagramsDelayed(container: HTMLElement, force = false, onComplete?: () => void): Promise<void> {
  // Set up observer for this container if not already done
  setupMermaidObserver(container);
  
  return new Promise((resolve) => {
    // Use requestAnimationFrame to ensure DOM is fully settled
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        // If force is true, clear any existing render markers
        if (force) {
          const allMermaidElements = container.querySelectorAll('.mermaid');
          allMermaidElements.forEach(el => {
            el.removeAttribute('data-rendered');
          });
        }
        
        await renderMermaidDiagrams(container, onComplete);
        resolve();
      });
    });
  });
}
