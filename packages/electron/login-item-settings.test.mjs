import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRefreshLoginItemSettings } from './login-item-settings.mjs';

test('skips disabled and unregistered login items', () => {
  assert.equal(shouldRefreshLoginItemSettings({ openAtLogin: false, status: 'not-found' }), false);
  assert.equal(shouldRefreshLoginItemSettings({}), false);
});

test('refreshes enabled login items so path and args stay current', () => {
  assert.equal(shouldRefreshLoginItemSettings({ openAtLogin: true }), true);
});

test('skips when login-item settings could not be read', () => {
  assert.equal(shouldRefreshLoginItemSettings(null), false);
  assert.equal(shouldRefreshLoginItemSettings(undefined), false);
});
