/**
 * Kept apart from the client module so optimistic state can shape records the
 * way the wire does, and tests that mock the client keep this helper real.
 */

import type { ContextPartMetadata } from "@/lib/messages/contextParts"
import type { JsonValue, Metadata } from "./model"
import { z } from "zod"

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
)

export const metadataRevisionSchema = z.string().regex(/^(0|[1-9]\d*)$/)

export const sessionMetadataStateSchema = z.object({
  metadata: z.record(z.string(), jsonValueSchema),
  revision: metadataRevisionSchema,
})

/**
 * Metadata crosses the wire as JSON. Round-tripping drops what JSON cannot
 * carry (undefined, functions) and gives the value the wire type honestly.
 */
export const toJsonRecord = (value: Metadata | ContextPartMetadata): Metadata =>
  // SAFETY: JSON.stringify emits only JSON values, so parsing its output back
  // yields a record of JsonValue by construction.
  JSON.parse(JSON.stringify(value)) as Metadata
