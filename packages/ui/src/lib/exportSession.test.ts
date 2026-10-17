import { describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import { formatSessionAsMarkdown } from './exportSession';

const message = (messageId: string, role: Message['role'], content: string, createdAt = 1): Message => ({
  messageId,
  sessionId: 'session',
  turnId: 'turn',
  role,
  createdAt,
  parts: [{ partId: `${messageId}-text`, type: 'text', content }],
});

describe('session export', () => {
  test('exports canonical context content and drops system prompt plumbing', () => {
    const markdown = formatSessionAsMarkdown([
      message('plumbing', 'system', 'The user is returning after a break.'),
      message('attached', 'user', 'Earlier answer\n\nFix this detail'),
      message('user', 'user', 'Fix the build'),
      message('answer', 'assistant', 'Fixed it', 2),
    ], 'Session');

    expect(markdown).toContain('Fix this detail');
    expect(markdown).not.toContain('returning after a break');
    expect(markdown).toContain('Fixed it');
  });
});
