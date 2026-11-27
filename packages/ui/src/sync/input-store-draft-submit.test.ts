import { afterEach, expect, test } from 'bun:test';
import { useInputStore } from './input-store';

const initial = useInputStore.getState();
afterEach(() => useInputStore.setState(initial));

test('a matching draft consumes the pending submit once and receives its text', () => {
  useInputStore.getState().requestDraftSubmit(7, 'ship it');
  expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBe('ship it');
  expect(useInputStore.getState().pendingDraftSubmit).toBeNull();
  expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBeNull();
});

test('a draft mismatch still clears the entry so stale shortcut text cannot leak into an unrelated draft', () => {
  useInputStore.getState().requestDraftSubmit(7, 'stale shortcut text');
  expect(useInputStore.getState().consumePendingDraftSubmit(8)).toBeNull();
  expect(useInputStore.getState().pendingDraftSubmit).toBeNull();
  expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBeNull();
});

test('a closed draft consumes the entry without receiving its text', () => {
  useInputStore.getState().requestDraftSubmit(7, 'for a draft already gone');
  expect(useInputStore.getState().consumePendingDraftSubmit(null)).toBeNull();
  expect(useInputStore.getState().pendingDraftSubmit).toBeNull();
});

test('consuming without a pending submit is a no-op', () => {
  expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBeNull();
  expect(useInputStore.getState().pendingDraftSubmit).toBeNull();
});

test('a newer request replaces an unconsumed one', () => {
  useInputStore.getState().requestDraftSubmit(7, 'first');
  useInputStore.getState().requestDraftSubmit(9, 'second');
  expect(useInputStore.getState().consumePendingDraftSubmit(9)).toBe('second');
  expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBeNull();
});
