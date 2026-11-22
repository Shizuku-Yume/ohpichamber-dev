import { afterEach, expect, test } from 'bun:test';
import { useInputStore } from './input-store';

const initial = useInputStore.getState();
afterEach(() => useInputStore.setState(initial));
const content = { files: [new File(['shared'], 'notes.txt')], text: 'Review this', rejected: [] };

test('shared content is delivered once to its owning draft', () => {
  useInputStore.getState().requestDraftContent(1, content);
  expect(useInputStore.getState().consumePendingDraftContent(1)).toEqual({ draftId: 1, ...content });
  expect(useInputStore.getState().consumePendingDraftContent(1)).toBeNull();
});

test('a missing draft cannot consume a sibling share', () => {
  useInputStore.getState().requestDraftContent(1, content);
  expect(useInputStore.getState().consumePendingDraftContent(2)).toBeNull();
  expect(useInputStore.getState().consumePendingDraftContent(1)?.files).toEqual(content.files);
});

test('concurrent shared drafts retain independent content', () => {
  useInputStore.getState().requestDraftContent(1, content);
  useInputStore.getState().requestDraftContent(2, { ...content, text: 'Another share' });
  expect(useInputStore.getState().consumePendingDraftContent(1)?.text).toBe('Review this');
  expect(useInputStore.getState().consumePendingDraftContent(2)?.text).toBe('Another share');
});

test('content captured by an expired runtime cannot be delivered', () => {
  useInputStore.setState({ pendingDraftContents: new Map([[1, { content: { draftId: 1, ...content }, isCurrent: () => false }]]) });
  expect(useInputStore.getState().consumePendingDraftContent(1)).toBeNull();
  expect(useInputStore.getState().pendingDraftContents.size).toBe(0);
});
