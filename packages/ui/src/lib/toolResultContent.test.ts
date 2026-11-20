import { describe, expect, test } from 'bun:test';
import type { ToolResultPart } from '@openchamber/agent-contract';
import { coerceToText, nativeToolResultContent, unwrapTextBlocks } from './toolResultContent';

const result = (output: ToolResultPart['output']): ToolResultPart => ({
  type: 'tool_result', partId: 'result', toolCallId: 'call', toolName: 'bash', output, isError: false,
});

describe('nativeToolResultContent', () => {
  test('decodes canonical text blocks and preserves structured details', () => {
    expect(nativeToolResultContent(result({ content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }], details: { exitCode: 0 } }))).toEqual({
      text: 'first\nsecond', images: [], details: { exitCode: 0 },
    });
  });

  test('retains safe images separately from text', () => {
    expect(nativeToolResultContent(result({ content: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }] }))).toEqual({
      text: '', images: [{ mediaType: 'image/png', data: 'aGVsbG8=' }], details: undefined,
    });
  });

  test('missing and empty results remain empty rather than stringified envelopes', () => {
    expect(nativeToolResultContent(undefined)).toEqual({ text: '', images: [] });
    expect(nativeToolResultContent(result({ content: [] }))).toEqual({ text: '', images: [], details: undefined });
    expect(nativeToolResultContent(result(null))).toEqual({ text: 'null', images: [] });
    expect(nativeToolResultContent(result(0))).toEqual({ text: '0', images: [] });
  });

  test('unknown or unsafe content stays inspectable but is not rendered as an image', () => {
    const unsupported = { type: 'image', mimeType: 'image/svg+xml', data: '<svg />' };
    const decoded = nativeToolResultContent(result({ content: [unsupported] }));
    expect(decoded.images).toEqual([]);
    expect(decoded.text).toBe(JSON.stringify(unsupported));
    const oversized = { type: 'image', mimeType: 'image/png', data: 'a'.repeat(14 * 1024 * 1024 + 1) };
    expect(nativeToolResultContent(result({ content: [oversized] })).images).toEqual([]);
  });

  test('nested text blocks share the bounded decoding used by the renderer', () => {
    const output = [{ type: 'text', text: JSON.stringify([{ type: 'text', text: 'answer' }]) }];
    expect(nativeToolResultContent(result(output)).text).toBe('answer');
    expect(unwrapTextBlocks({ type: 'text', text: '[invalid]' })).toBe('[invalid]');
    expect(unwrapTextBlocks({ type: 'other', text: 'not text' })).toBeNull();
  });

  test('failed results do not manufacture output or erase their error', () => {
    const failed: ToolResultPart = { ...result(undefined), isError: true, error: 'Command failed' };
    expect(nativeToolResultContent(failed)).toEqual({ text: '', images: [] });
    expect(failed.error).toBe('Command failed');
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(coerceToText(circular, 'unprintable')).toBe('unprintable');
  });
});
