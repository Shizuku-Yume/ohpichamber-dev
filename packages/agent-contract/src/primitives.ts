import { z } from 'zod';

export const EntityIdSchema = z.string().min(1);
export type EntityId = z.infer<typeof EntityIdSchema>;

export const CounterSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(
  (value) => value.length < 20 || (value.length === 20 && value <= '18446744073709551615'),
  { message: 'Counter must fit unsigned 64-bit decimal' },
);
export type Counter = z.infer<typeof CounterSchema>;
export const PositiveCounterSchema = CounterSchema.refine((value) => value !== '0', { message: 'Counter must be positive' });
export type PositiveCounter = z.infer<typeof PositiveCounterSchema>;
export const EpochSchema = z.string().min(1).refine((value) => !value.includes(':'), { message: 'Epoch cannot contain a colon' });
export type Epoch = z.infer<typeof EpochSchema>;
export const CursorSchema = z.string().refine((value) => {
  const separator = value.indexOf(':');
  return separator > 0 && EpochSchema.safeParse(value.slice(0, separator)).success
    && CounterSchema.safeParse(value.slice(separator + 1)).success;
}, { message: 'Cursor must contain an epoch and canonical uint64 counter' });
export type Cursor = z.infer<typeof CursorSchema>;
export const TimestampSchema = z.number().int().nonnegative();
export type Timestamp = z.infer<typeof TimestampSchema>;
export const JsonValueSchema = z.json();
export type JsonValue = z.infer<typeof JsonValueSchema>;
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
export type JsonObject = z.infer<typeof JsonObjectSchema>;
