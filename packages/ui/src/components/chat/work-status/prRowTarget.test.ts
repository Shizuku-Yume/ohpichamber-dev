import { describe, expect, test } from 'bun:test';
import { resolvePrRowTarget } from './prRowTarget';

const PR_URL = 'https://github.com/acme/app/pull/7';

describe('branch pull request row', () => {
  test('the phone needs the URL for its board; desktop opens the Tracker tab either way', () => {
    expect(resolvePrRowTarget({ directory: '/repo', prUrl: PR_URL, mobile: true, vscode: false })).toBe('board');
    expect(resolvePrRowTarget({ directory: '/repo', prUrl: null, mobile: true, vscode: false })).toBeNull();
    expect(resolvePrRowTarget({ directory: '/repo', prUrl: null, mobile: false, vscode: false })).toBe('context-panel');
    expect(resolvePrRowTarget({ directory: '/repo', prUrl: PR_URL, mobile: false, vscode: false })).toBe('context-panel');
    expect(resolvePrRowTarget({ directory: null, prUrl: PR_URL, mobile: false, vscode: false })).toBeNull();
  });
});
