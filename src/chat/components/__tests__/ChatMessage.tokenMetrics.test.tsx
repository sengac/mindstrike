import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../ChatMessage';
import type { ConversationMessage } from '../../../types';

// Mock marked and DOMPurify
vi.mock('marked', () => ({
  marked: {
    parse: vi.fn((text: string) => `<p>${text}</p>`),
  },
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html),
  },
}));

// Mock katex
vi.mock('katex', () => ({
  default: {
    render: vi.fn(),
  },
}));

// Mock react-syntax-highlighter
vi.mock('react-syntax-highlighter', () => ({
  Prism: vi.fn(({ children }) => <pre>{children}</pre>),
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

// Mock MermaidModal
vi.mock('../../../components/MermaidModal', () => ({
  MermaidModal: vi.fn(() => null),
}));

// Mock CitationRenderer
vi.mock('../CitationRenderer', () => ({
  CitationRenderer: vi.fn(() => null),
}));

// Mock mermaidRenderer
vi.mock('../../../utils/mermaidRenderer', () => ({
  renderMermaidDiagramsDelayed: vi.fn(),
}));

describe('ChatMessage - Token Metrics Display', () => {
  const baseMessage: ConversationMessage = {
    id: 'test-msg-1',
    role: 'assistant',
    content: 'This is a test response',
    timestamp: new Date('2024-01-01T12:00:00Z'),
    status: 'completed',
  };

  it('should display token metrics when available', () => {
    const messageWithTokens: ConversationMessage = {
      ...baseMessage,
      model: 'gpt-4',
      medianTokensPerSecond: 42.5,
      totalTokens: 1234,
    };

    render(<ChatMessage message={messageWithTokens} />);

    // Check for model display
    expect(screen.getByText(/via gpt-4/)).toBeDefined();

    // Check for token rate display
    expect(screen.getByText(/42\.5 tok\/s/)).toBeDefined();

    // Check for total tokens display
    expect(screen.getByText(/1,234 tokens/)).toBeDefined();
  });

  it('should always display token metrics with model', () => {
    const messageWithMetrics: ConversationMessage = {
      ...baseMessage,
      model: 'gpt-3.5-turbo',
      medianTokensPerSecond: 30.5,
      totalTokens: 850,
    };

    render(<ChatMessage message={messageWithMetrics} />);

    // Should show model and metrics
    expect(screen.getByText(/via gpt-3.5-turbo/)).toBeDefined();
    expect(screen.getByText(/30.5 tok\/s/)).toBeDefined();
    expect(screen.getByText(/850 tokens/)).toBeDefined();
  });

  it('should display both token rate and total tokens', () => {
    const messageWithBothMetrics: ConversationMessage = {
      ...baseMessage,
      model: 'claude-3-opus',
      medianTokensPerSecond: 35.7,
      totalTokens: 1200,
    };

    render(<ChatMessage message={messageWithBothMetrics} />);

    // Should show both metrics
    expect(screen.getByText(/35\.7 tok\/s/)).toBeDefined();
    expect(screen.getByText(/1,200 tokens/)).toBeDefined();
  });

  it('should format large token counts with commas', () => {
    const messageWithLargeTokenCount: ConversationMessage = {
      ...baseMessage,
      model: 'gpt-4',
      totalTokens: 123456,
    };

    render(<ChatMessage message={messageWithLargeTokenCount} />);

    // Should format with commas
    expect(screen.getByText(/123,456 tokens/)).toBeDefined();
  });

  it('should round token rate to one decimal place', () => {
    const messageWithPreciseRate: ConversationMessage = {
      ...baseMessage,
      model: 'llama-3',
      medianTokensPerSecond: 45.678,
    };

    render(<ChatMessage message={messageWithPreciseRate} />);

    // Should round to 1 decimal
    expect(screen.getByText(/45\.7 tok\/s/)).toBeDefined();
    expect(screen.queryByText(/45\.678/)).toBeNull();
  });

  it('should not display metrics for user messages', () => {
    const userMessage: ConversationMessage = {
      ...baseMessage,
      role: 'user',
      model: 'gpt-4',
      medianTokensPerSecond: 42.5,
      totalTokens: 1234,
    };

    render(<ChatMessage message={userMessage} />);

    // User messages should not show model or metrics
    expect(screen.queryByText(/via gpt-4/)).toBeNull();
    expect(screen.queryByText(/tok\/s/)).toBeNull();
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it('should display metrics alongside other message features', () => {
    const messageWithAllFeatures: ConversationMessage = {
      ...baseMessage,
      model: 'claude-3-sonnet',
      medianTokensPerSecond: 28.9,
      totalTokens: 567,
      toolCalls: [
        {
          id: 'tool-1',
          name: 'search',
          parameters: { query: 'test' },
        },
      ],
      citations: ['https://example.com'],
    };

    const { container } = render(
      <ChatMessage message={messageWithAllFeatures} />
    );

    // Should show all metrics
    expect(screen.getByText(/via claude-3-sonnet/)).toBeDefined();
    expect(screen.getByText(/28\.9 tok\/s/)).toBeDefined();
    expect(screen.getByText(/567 tokens/)).toBeDefined();

    // Should still display in metadata section
    const metadataSection = container.querySelector('.text-gray-400');
    expect(metadataSection).toBeDefined();
  });

  it('should display non-zero token metrics only', () => {
    const messageWithValidMetrics: ConversationMessage = {
      ...baseMessage,
      model: 'test-model',
      medianTokensPerSecond: 15.5,
      totalTokens: 100,
    };

    render(<ChatMessage message={messageWithValidMetrics} />);

    // Should display valid metrics
    expect(screen.getByText(/15.5 tok\/s/)).toBeDefined();
    expect(screen.getByText(/100 tokens/)).toBeDefined();
  });

  it('should maintain consistent formatting across different values', () => {
    const testCases = [
      {
        rate: 1.0,
        tokens: 10,
        expectedRate: '1.0 tok/s',
        expectedTokens: '10 tokens',
      },
      {
        rate: 99.9,
        tokens: 999,
        expectedRate: '99.9 tok/s',
        expectedTokens: '999 tokens',
      },
      {
        rate: 100.1,
        tokens: 1000,
        expectedRate: '100.1 tok/s',
        expectedTokens: '1,000 tokens',
      },
      {
        rate: 0.5,
        tokens: 5,
        expectedRate: '0.5 tok/s',
        expectedTokens: '5 tokens',
      },
    ];

    testCases.forEach(({ rate, tokens, expectedRate, expectedTokens }) => {
      const message: ConversationMessage = {
        ...baseMessage,
        id: `msg-${rate}-${tokens}`,
        model: 'test-model',
        medianTokensPerSecond: rate,
        totalTokens: tokens,
      };

      const { unmount } = render(<ChatMessage message={message} />);

      expect(screen.getByText(new RegExp(expectedRate))).toBeDefined();
      expect(screen.getByText(new RegExp(expectedTokens))).toBeDefined();

      unmount();
    });
  });
});
