import { describe, expect, test } from 'bun:test';

import type { Part, TextPart } from '@openchamber/agent-contract';
import { flattenAssistantTextParts, flattenUserTextParts } from './messageText';

const textPart = (partId: string, content: string): TextPart => ({ type: 'text', partId, content });
const makeParts = (texts: string[]): Part[] => texts.map((text, index) => textPart(`p${index}`, text));

describe('flattenAssistantTextParts', () => {
  const parts = makeParts(['第一段', '第二段', '```js\nconsole.log(1)\n```', '第三段', '- item 1\n- item 2']);

  test('blank lines between paragraphs/code blocks/lists are preserved', () => {
    expect(flattenAssistantTextParts(parts)).toBe('第一段\n\n第二段\n\n```js\nconsole.log(1)\n```\n\n第三段\n\n- item 1\n- item 2');
  });
  test('a code fence is not glued to the following paragraph', () => {
    const flattened = flattenAssistantTextParts(parts);
    expect(flattened).not.toContain('```\n第三段');
    expect(flattened).toContain('```\n\n第三段');
  });
  test('list items keep single newlines inside their part', () => {
    expect(flattenAssistantTextParts(parts)).toContain('\n\n- item 1\n- item 2');
  });
  test('internal blank-line runs are preserved', () => {
    const text = 'a\n\n\n\nb\n \n \nd';
    expect(flattenAssistantTextParts(makeParts([text]))).toBe(text);
  });
  test('multiple blank lines inside a fenced code block are preserved', () => {
    const fenced = '```js\na\n\n\nb\n```';
    expect(flattenAssistantTextParts(makeParts([fenced]))).toBe(fenced);
  });
  test('part boundaries produce block separators', () => {
    expect(flattenAssistantTextParts(makeParts(['first', 'second']))).toBe('first\n\nsecond');
  });
  test('empty and whitespace-only parts are dropped', () => {
    expect(flattenAssistantTextParts([])).toBe('');
    expect(flattenAssistantTextParts(makeParts(['', '   ', '\n']))).toBe('');
  });
  test('single part without blank lines is returned unchanged', () => {
    expect(flattenAssistantTextParts(makeParts(['only line\nsecond line']))).toBe('only line\nsecond line');
  });
  test('non-text parts are ignored', () => {
    const partsWithReasoning: Part[] = [...makeParts(['before']), { type: 'reasoning', partId: 'r1', content: 'ignored' }, ...makeParts(['after'])];
    expect(flattenAssistantTextParts(partsWithReasoning)).toBe('before\n\nafter');
  });
});

describe('flattenUserTextParts', () => {
  test('plain text parts keep blank-line block separators', () => {
    const parts = [textPart('u1', '第一段\n\n\n第二段'), textPart('u2', '下一段')];
    expect(flattenUserTextParts(parts)).toBe('第一段\n\n\n第二段\n\n下一段');
  });
  test('returns empty string for parts without text', () => {
    expect(flattenUserTextParts([])).toBe('');
    expect(flattenUserTextParts([{ type: 'reasoning', partId: 'r1', content: 'ignored' }])).toBe('');
  });
});
