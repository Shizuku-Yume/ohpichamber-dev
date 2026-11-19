import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldUpdateLoginItemSettings } from './login-item-settings.mjs';

test('leaves disabled and unregistered login items unchanged', () => {
  assert.equal(shouldUpdateLoginItemSettings(false, { openAtLogin: false, status: 'not-found' }), false);
  assert.equal(shouldUpdateLoginItemSettings(false, {}), false);
});

test('leaves enabled login items unchanged', () => {
  assert.equal(shouldUpdateLoginItemSettings(true, { openAtLogin: true }), false);
});

test('updates login items only when the preference differs', () => {
  assert.equal(shouldUpdateLoginItemSettings(true, { openAtLogin: false }), true);
  assert.equal(shouldUpdateLoginItemSettings(false, { openAtLogin: true }), true);
});

test('does not write when login-item settings could not be read', () => {
  assert.equal(shouldUpdateLoginItemSettings(undefined, { openAtLogin: true }), false);
  assert.equal(shouldUpdateLoginItemSettings(false, null), false);
});
