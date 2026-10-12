import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { isSurfaceAttended } from './surfaceAttention';

const dom = new Window();
Object.assign(globalThis, { window: dom, document: dom.document });

let documentFocused = true;
dom.document.hasFocus = () => documentFocused;

describe('surfaceAttention', () => {
  test('follows document focus', () => {
    documentFocused = true;
    expect(isSurfaceAttended()).toBe(true);
    documentFocused = false;
    expect(isSurfaceAttended()).toBe(false);
  });
});
