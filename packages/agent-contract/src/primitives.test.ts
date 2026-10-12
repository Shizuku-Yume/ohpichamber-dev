import { describe, expect, test } from 'bun:test';
import { CounterSchema, CursorSchema, EpochSchema, EntityIdSchema, JsonObjectSchema, JsonValueSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';

describe('primitive wire schemas', () => {
  test('round-trips canonical ids, counters, cursor epochs, and timestamps', () => {
    expect(EntityIdSchema.parse('id')).toBe('id');
    expect(CounterSchema.parse('0')).toBe('0');
    expect(CounterSchema.parse('9007199254740993')).toBe('9007199254740993');
    expect(CounterSchema.parse('18446744073709551615')).toBe('18446744073709551615');
    expect(PositiveCounterSchema.parse('1')).toBe('1');
    expect(EpochSchema.parse('epoch-1')).toBe('epoch-1');
    expect(CursorSchema.parse('epoch-1:18446744073709551615')).toBe('epoch-1:18446744073709551615');
    expect(TimestampSchema.parse(0)).toBe(0);
  });

  test('rejects invalid identifier, epoch, timestamp, counter, and cursor boundaries', () => {
    expect(EntityIdSchema.safeParse('').success).toBe(false);
    expect(EpochSchema.safeParse('').success).toBe(false);
    expect(EpochSchema.safeParse('bad:epoch').success).toBe(false);
    expect(TimestampSchema.safeParse(-1).success).toBe(false);
    expect(TimestampSchema.safeParse(1.5).success).toBe(false);
    for (const value of ['', '01', '18446744073709551616', '99999999999999999999']) expect(CounterSchema.safeParse(value).success).toBe(false);
    expect(PositiveCounterSchema.safeParse('0').success).toBe(false);
    expect(CursorSchema.safeParse('epoch:01').success).toBe(false);
    expect(CursorSchema.safeParse(':1').success).toBe(false);
  });

  test('round-trips JSON and rejects unsupported values, including nested values', () => {
    const value = { a: [null, true, 'x', 1], nested: { ok: false } };
    expect(JsonValueSchema.parse(value)).toEqual(value);
    expect(JsonObjectSchema.parse({ nested: { ok: true } })).toEqual({ nested: { ok: true } });
    for (const value of [undefined, () => 1, NaN, Infinity, -Infinity, new Date(), 1n]) expect(JsonValueSchema.safeParse(value).success).toBe(false);
    expect(JsonValueSchema.safeParse({ nested: { unsupported: undefined } }).success).toBe(false);
    expect(JsonObjectSchema.safeParse({ nested: { unsupported: undefined } }).success).toBe(false);
  });
});
