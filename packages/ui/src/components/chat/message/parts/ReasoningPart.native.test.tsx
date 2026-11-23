import React from 'react';
import { afterEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Part } from '@openchamber/agent-contract';
import { I18nProvider } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import ReasoningPart from './ReasoningPart';

const initialState = useUIStore.getInitialState();
const original = { ...initialState };
afterEach(() => { Object.assign(initialState, original); });
const render = (content: string, streamPhase?: 'streaming' | 'completed') => renderToStaticMarkup(
  <I18nProvider><ReasoningPart part={{ type: 'reasoning', partId: 'reason', content }} messageId="message" streamPhase={streamPhase} /></I18nProvider>,
);

test('completed Canonical reasoning renders its summary without invented timing', () => {
  Object.assign(initialState, { chatRenderMode: 'sorted', expandReasoningWhileStreaming: false });
  expect(render('Consider the request')).toContain('Consider the request');
  expect(render('Consider the request')).not.toContain('data-streaming="true"');
});

test('empty and invisible completed reasoning render nothing', () => {
  expect(render('')).toBe('');
  expect(render('\u200b\u00a0 ')).toBe('');
});

test('only an actual live phase can show an empty busy reasoning header', () => {
  Object.assign(initialState, { chatRenderMode: 'live', expandReasoningWhileStreaming: false });
  expect(render('', 'streaming')).not.toBe('');
  expect(render('', 'completed')).toBe('');
  Object.assign(initialState, { chatRenderMode: 'sorted' });
  expect(render('', 'streaming')).toBe('');
});

test('other Canonical part kinds do not render as reasoning', () => {
  const part: Part = { type: 'text', partId: 'text', content: 'Answer' };
  expect(renderToStaticMarkup(<I18nProvider><ReasoningPart part={part} messageId="message" /></I18nProvider>)).toBe('');
});
