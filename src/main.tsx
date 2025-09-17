import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Override fetch to handle /api routes
const originalFetch = window.fetch;
window.fetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  if (url.startsWith('/api')) {
    const baseUrl =
      import.meta.env.MODE === 'development' ? 'http://localhost:3001' : '';
    const fullUrl = baseUrl + url;
    return originalFetch(fullUrl, init);
  }

  return originalFetch(input, init);
};

// Override EventSource to handle /api routes
const OriginalEventSource = window.EventSource;
window.EventSource = function (
  this: EventSource,
  url: string | URL,
  eventSourceInitDict?: { withCredentials?: boolean }
) {
  const urlString = typeof url === 'string' ? url : url.href;
  console.log('EventSource intercepted:', urlString);

  if (urlString.startsWith('/api')) {
    const baseUrl =
      import.meta.env.MODE === 'development' ? 'http://localhost:3001' : '';
    const fullUrl = baseUrl + urlString;
    console.log('Redirecting EventSource from', urlString, 'to', fullUrl);
    return new OriginalEventSource(fullUrl, eventSourceInitDict);
  }

  return new OriginalEventSource(url, eventSourceInitDict);
} as any;

// Import App after setting up overrides to avoid race condition
async function startApp() {
  const { default: App } = await import('./App.tsx');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

startApp();
