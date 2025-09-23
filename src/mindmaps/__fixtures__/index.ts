// Export all fixtures for easy importing in tests
export * from './mindMapData';
export * from './storeMocks';
export * from './apiMocks';
export * from './reactFlowMocks';

// Re-export commonly used test utilities
export { vi } from 'vitest';
export { render, screen, fireEvent, waitFor } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
