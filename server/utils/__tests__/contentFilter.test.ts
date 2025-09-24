import { describe, it, expect } from 'vitest';
import { stripThinkTags, cleanContentForLLM } from '../contentFilter';

describe('ContentFilter', () => {
  describe('stripThinkTags', () => {
    it('should remove think tags and their content', () => {
      const input = 'Before <think>internal thoughts</think> After';
      const result = stripThinkTags(input);
      expect(result).toBe('Before  After');
    });

    it('should handle multiline think tags', () => {
      const input = `Start
<think>
Line 1
Line 2
Line 3
</think>
End`;
      const result = stripThinkTags(input);
      expect(result).toBe('Start\n\nEnd');
    });

    it('should handle multiple think tags', () => {
      const input = 'A <think>first</think> B <think>second</think> C';
      const result = stripThinkTags(input);
      expect(result).toBe('A  B  C');
    });

    it('should handle empty input', () => {
      expect(stripThinkTags('')).toBe('');
    });

    it('should handle input without think tags', () => {
      const input = 'This is regular text without any tags';
      expect(stripThinkTags(input)).toBe(input);
    });

    it('should handle nested think tags', () => {
      // Note: The current regex doesn't handle nested tags properly
      // This is expected behavior - it matches from first <think> to first </think>
      const input =
        'Outer <think>inner <think>nested</think> content</think> text';
      const result = stripThinkTags(input);
      // The inner </think> ends the match early, leaving " content</think> text"
      expect(result).toBe('Outer  content</think> text');
    });
  });

  describe('cleanContentForLLM', () => {
    it('should clean content by removing think tags', () => {
      const input = 'User message <think>AI thinking</think> with response';
      const result = cleanContentForLLM(input);
      expect(result).toBe('User message  with response');
    });

    it('should handle complex content', () => {
      const input = `Here's my response:
<think>
I need to consider:
- Point 1
- Point 2
</think>
The answer is 42.`;

      const result = cleanContentForLLM(input);
      expect(result).toBe(`Here's my response:\n\nThe answer is 42.`);
    });
  });
});
