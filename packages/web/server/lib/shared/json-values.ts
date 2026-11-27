import { z } from 'zod';

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue | undefined };

export const JsonValueSchema: z.ZodType<JsonValue> = z.json();

export const jsonObjectSchema = z.record(z.string(), z.union([z.json(), z.undefined()]));

export const parseJsonObject = (value: unknown): JsonObject | null => {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
