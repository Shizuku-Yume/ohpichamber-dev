import { describe, expect, test } from 'bun:test';
import {
  FORM_CUSTOM_TEXTAREA_MIN_HEIGHT,
  getFormCustomTextareaHeight,
} from './formTextareaSizing';

describe('form custom textarea sizing', () => {
  test('never shrinks below the two-line minimum', () => {
    expect(FORM_CUSTOM_TEXTAREA_MIN_HEIGHT).toBe(40);
    expect(getFormCustomTextareaHeight({ scrollHeight: 12, currentHeight: 100 })).toBe(40);
    expect(getFormCustomTextareaHeight({ scrollHeight: 0, currentHeight: null })).toBe(40);
  });

  test('grows with the content and caps at ten lines', () => {
    expect(getFormCustomTextareaHeight({ scrollHeight: 61, currentHeight: 40 })).toBe(61);
    expect(getFormCustomTextareaHeight({ scrollHeight: 180, currentHeight: 80 })).toBe(180);
    expect(getFormCustomTextareaHeight({ scrollHeight: 500, currentHeight: 120 })).toBe(200);
  });

  test('returns null when the measured height is already current', () => {
    expect(getFormCustomTextareaHeight({ scrollHeight: 60, currentHeight: 60 })).toBeNull();
    expect(getFormCustomTextareaHeight({ scrollHeight: 4, currentHeight: 40 })).toBeNull();
    expect(getFormCustomTextareaHeight({ scrollHeight: 500, currentHeight: 200 })).toBeNull();
  });
});
