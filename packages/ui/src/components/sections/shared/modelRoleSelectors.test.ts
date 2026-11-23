import { expect, test } from 'bun:test';
import { replaceFirstSelector, roleSelector } from './modelRoleSelectors';

test('replacing the primary selector preserves the configured fallback list verbatim', () => {
  const configured = 'first/old:low, @smol, backup/latest';
  expect(roleSelector(configured)).toBe('first/old:low');
  expect(replaceFirstSelector(configured, 'first/new')).toBe('first/new, @smol, backup/latest');
  expect(replaceFirstSelector(null, 'first/new')).toBe('first/new');
});
