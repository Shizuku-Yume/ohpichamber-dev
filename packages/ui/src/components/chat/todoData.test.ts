import { expect, test } from 'bun:test';
import { extractTodoPhases } from './todoData';

test('historical blocked todo transcripts render as pending without blocker metadata', () => {
  expect(extractTodoPhases({ phases: [{ name: 'Work', tasks: [
    { content: 'Review', status: 'blocked', blocker: 'Waiting' },
    { content: 'Ship', status: 'completed' },
  ] }] })).toEqual([{ name: 'Work', tasks: [
    { content: 'Review', status: 'pending' },
    { content: 'Ship', status: 'completed' },
  ] }]);
});

test('empty and malformed todo details remain distinct', () => {
  expect(extractTodoPhases({ phases: [] })).toEqual([]);
  expect(extractTodoPhases(undefined)).toBeNull();
  expect(extractTodoPhases({ phases: [{ name: 'Work', tasks: [{ content: 'Review', status: 'unknown' }] }] })).toBeNull();
});
