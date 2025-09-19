// Storm toast effect that works with react-hot-toast
export function initStormToastEffect() {
  // Observer to watch for new toasts
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          // Find storm toasts
          const stormToasts = element.querySelectorAll('.storm-toast');
          stormToasts.forEach(setupStormToast);

          // Also check if the added node itself is a storm toast
          if (element.classList.contains('storm-toast')) {
            setupStormToast(element);
          }
        }
      });
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}

function setupStormToast(toast: Element) {
  // Find the text content
  const textElement = toast.querySelector('[data-visible]') || toast;

  if (!textElement.textContent) return;

  let isScattering = false;

  // Watch for when the toast starts to disappear
  const toastObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'data-visible'
      ) {
        const target = mutation.target as Element;
        if (target.getAttribute('data-visible') === 'false' && !isScattering) {
          startStormScatter(toast, textElement);
          isScattering = true;
        }
      }
    });
  });

  toastObserver.observe(textElement, {
    attributes: true,
    attributeFilter: ['data-visible'],
  });

  // Also set up a timer as backup
  setTimeout(() => {
    if (!isScattering) {
      startStormScatter(toast, textElement);
      isScattering = true;
    }
  }, 3500); // Start scattering 500ms before toast disappears
}

function startStormScatter(toast: Element, textElement: Element) {
  // Just add the scattering class to trigger the simple slide-out animation
  toast.classList.add('storm-scattering');
}
