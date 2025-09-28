import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CitationRenderer } from '../CitationRenderer';

describe('CitationRenderer', () => {
  beforeEach(() => {
    // Mock window.open
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('renders content without citations normally', () => {
    const content = 'This is regular content without citations.';

    const { container } = render(<CitationRenderer content={content} />);

    expect(container.textContent).toContain(
      'This is regular content without citations.'
    );
  });

  it('renders citation links with correct numbers', () => {
    const content = 'This has citations[^1] and another[^2].';
    const citations = [
      'https://example.com/source1',
      'https://example.com/source2',
    ];

    render(<CitationRenderer content={content} citations={citations} />);

    // Check that citation buttons are rendered
    const citationButtons = screen.getAllByTitle('Click to open example.com');
    expect(citationButtons).toHaveLength(2);
    expect(citationButtons[0].textContent).toContain('1');
    expect(citationButtons[1].textContent).toContain('2');
  });

  it('opens citation URL in new tab when clicked', async () => {
    const content = 'Content with citation[^1].';
    const citations = ['https://example.com/article'];

    render(<CitationRenderer content={content} citations={citations} />);

    const citationButton = screen.getByTitle('Click to open example.com');
    fireEvent.click(citationButton);

    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/article',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('shows tooltip on hover', async () => {
    const content = 'Content with citation[^1].';
    const citations = ['https://example.com/article'];

    const { container } = render(
      <CitationRenderer content={content} citations={citations} />
    );

    const citationButton = screen.getByTitle('Click to open example.com');

    // Hover over citation
    fireEvent.mouseOver(citationButton);

    // Wait for tooltip to appear
    await waitFor(() => {
      const tooltip = screen.getByText('Citation 1');
      expect(tooltip).toBeTruthy();
    });

    // Check tooltip content
    expect(screen.getByText('https://example.com/article')).toBeTruthy();
    expect(screen.getByText('Click to open in new tab')).toBeTruthy();
  });

  it('handles multiple citations correctly', () => {
    const content = 'First citation[^1], second[^2], and third[^3].';
    const citations = [
      'https://source1.com',
      'https://source2.com',
      'https://source3.com',
    ];

    render(<CitationRenderer content={content} citations={citations} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    // Check each citation button
    expect(buttons[0].textContent).toContain('1');
    expect(buttons[1].textContent).toContain('2');
    expect(buttons[2].textContent).toContain('3');
  });

  it('handles citations with non-URL text gracefully', () => {
    const content = 'Citation[^1] here.';
    const citations = ['Not a valid URL but still a citation'];

    render(<CitationRenderer content={content} citations={citations} />);

    const citationButton = screen.getByRole('button');
    expect(citationButton.title).toContain('Not a valid URL but still a ci...');
  });

  it('ignores citation markers without corresponding citations', () => {
    const content = 'Has citation[^1] but also invalid[^5].';
    const citations = ['https://example.com'];

    const { container } = render(
      <CitationRenderer content={content} citations={citations} />
    );

    // Should have one button for valid citation
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    // Invalid citation should be rendered as plain text
    expect(container.textContent).toContain('[^5]');
  });

  it('renders markdown content with citations', () => {
    const content = '**Bold text** with citation[^1].';
    const citations = ['https://example.com'];

    const { container } = render(
      <CitationRenderer content={content} citations={citations} />
    );

    // Check that markdown is processed (bold text should be in <strong> tags)
    const strongElement = container.querySelector('strong');
    expect(strongElement).toBeTruthy();
    expect(strongElement?.textContent).toBe('Bold text');

    // Check that citation is still clickable
    const citationButton = screen.getByRole('button');
    expect(citationButton).toBeTruthy();
  });
});
