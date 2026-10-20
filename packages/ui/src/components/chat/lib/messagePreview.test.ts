import { describe, expect, test } from 'bun:test';
import type { Part } from '@openchamber/agent-contract';
import { appendTerminalContexts } from '@/lib/messages/terminalContext';
import { getFullText, getMessagePreview, getPromptPreviewText } from './messagePreview';

const text = (content: string): Part => ({ type: 'text', partId: 'text', content });
const attachment: Part = {
  type: 'attachment', partId: 'attachment', attachmentId: 'upload', name: 'diagram.png',
  mediaType: 'image/png', size: 1, uri: 'attachment://upload',
};
const terminalText = (prompt: string) => text(appendTerminalContexts(prompt, [{
  terminalId: 'terminal', terminalLabel: 'Build', startLine: 1, endLine: 2, text: 'first\nsecond',
}]));

describe('native message previews', () => {
  test('joins only canonical text content for full text', () => {
    expect(getFullText([text('hello'), attachment, text('world')])).toBe('hello\nworld');
  });
  test('collapses newlines and truncates the preview', () => {
    expect(getMessagePreview([text('line one\nline two')])).toBe('line one line two');
    expect(getMessagePreview([text('abcdefghijklmnopqrstuvwxyz')], 10)).toBe('abcdefghij…');
  });
  test('uses native attachment names for attachment-only messages', () => {
    expect(getPromptPreviewText([attachment])).toBe('diagram.png');
    expect(getFullText([attachment])).toBe('');
    expect(getPromptPreviewText([attachment, text('explain this')])).toBe('explain this');
  });
  test('never substitutes tool input, output, errors, or reasoning for user content', () => {
    const parts: Part[] = [
      { type: 'tool_call', partId: 'call', toolCallId: 'tool', toolName: 'bash', input: { command: 'echo secret' }, status: 'failed' },
      { type: 'tool_result', partId: 'result', toolCallId: 'tool', toolName: 'bash', output: 'secret', error: 'failure', isError: true },
      { type: 'reasoning', partId: 'reasoning', content: 'thinking' },
    ];
    expect(getFullText(parts)).toBe('');
    expect(getMessagePreview(parts)).toBe('');
    expect(getMessagePreview([])).toBe('');
  });
  test('preserves canonical context prompt content without metadata reconstruction', () => {
    expect(getPromptPreviewText([text('Quoted from an earlier message:\n\n> quoted bit\n\nwhy this?')]))
      .toBe('Quoted from an earlier message:\n\n> quoted bit\n\nwhy this?');
  });
  test('shows typed text before terminal attachment details', () => {
    expect(getPromptPreviewText([terminalText('please explain')])).toBe('please explain');
  });
  test('uses the renderer terminal parser and translated context caption', () => {
    const preview = getPromptPreviewText([terminalText('')], (key, params) =>
      key === 'chat.message.terminalContext' ? `Terminal ${params?.terminal} (${params?.start}-${params?.end})` : key);
    expect(preview).toBe('Terminal Build (1-2): first\nsecond');
    expect(getPromptPreviewText([terminalText('')])).toBe('Build 1-2: first\nsecond');
  });
});
