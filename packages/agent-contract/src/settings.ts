import { z } from 'zod';
import { CounterSchema, EntityIdSchema, JsonValueSchema } from './primitives.ts';

/**
 * Where a setting belongs:
 * - `page`: an OpenChamber page that owns the concept, mapped to `page` and `section`.
 * - `engine`: the OMP settings page (the long tail of internal settings).
 * - `tui-only`: terminal presentation or terminal interaction.
 * - `owned-by`: an existing OpenChamber control already owns and writes the concept,
 *   named by `owner` (that control's settings-item id).
 * - `config-only`: a `record`/`array` value no GUI control can edit (no choices to
 *   render). It is edited in `config.yml` and listed with the OMP page's other
 *   unrendered settings.
 * - `hidden`: untabbed or intentionally hidden internal setting.
 */
export const OmpSettingIdSchema = z.string().min(1);
export type OmpSettingId = z.infer<typeof OmpSettingIdSchema>;

export const OmpSettingTypeSchema = z.enum(['boolean', 'number', 'string', 'enum', 'array', 'record']);
export type OmpSettingType = z.infer<typeof OmpSettingTypeSchema>;

export const OmpSettingPlacementSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('page'),
    page: z.string().min(1),
    section: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('engine'),
  }),
  z.strictObject({
    type: z.literal('tui-only'),
  }),
  z.strictObject({
    type: z.literal('owned-by'),
    owner: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('config-only'),
  }),
  z.strictObject({
    type: z.literal('hidden'),
  }),
  z.strictObject({
    type: z.literal('boundary'),
  }),
]);
export type OmpSettingPlacement = z.infer<typeof OmpSettingPlacementSchema>;

export function parsePlacement(raw: string): OmpSettingPlacement {
  if (raw === 'engine') return { type: 'engine' };
  if (raw === 'tui-only') return { type: 'tui-only' };
  if (raw === 'config-only') return { type: 'config-only' };
  if (raw === 'hidden') return { type: 'hidden' };
  if (raw === 'boundary') return { type: 'boundary' };
  if (raw.startsWith('owned-by ')) {
    const owner = raw.slice('owned-by '.length).trim();
    if (owner.length > 0) return { type: 'owned-by', owner };
  }
  const colonIndex = raw.indexOf(':');
  if (colonIndex > 0) {
    const page = raw.slice(0, colonIndex);
    const section = raw.slice(colonIndex + 1);
    if (page.length > 0 && section.length > 0) {
      return { type: 'page', page, section };
    }
  }
  throw new Error(`Invalid placement string: "${raw}"`);
}

export function formatPlacement(placement: OmpSettingPlacement): string {
  switch (placement.type) {
    case 'engine': return 'engine';
    case 'tui-only': return 'tui-only';
    case 'boundary': return 'boundary';
    case 'config-only': return 'config-only';
    case 'hidden': return 'hidden';
    case 'owned-by': return `owned-by ${placement.owner}`;
    case 'page': return `${placement.page}:${placement.section}`;
  }
}
export const OmpSettingOptionSchema = z.strictObject({
  value: z.string(),
  label: z.string().min(1),
  description: z.string().optional(),
});
export type OmpSettingOption = z.infer<typeof OmpSettingOptionSchema>;

/** A setting value from OMP; `null` means the global config does not set it. */
export const OmpSettingValueSchema = JsonValueSchema.nullable();
export type OmpSettingValue = z.infer<typeof OmpSettingValueSchema>;

export const OMP_POWER_CONDITIONS = {
  usesSharedConfig: 'powerUsesSharedConfig',
  backendAvailable: 'powerBackendAvailable',
} as const;

export const OmpSettingSchema = z.strictObject({
  id: OmpSettingIdSchema,
  type: OmpSettingTypeSchema,
  /** Effective layered value. `null` when the setting has no value at any layer. */
  value: OmpSettingValueSchema,
  /** OMP's declared default, when the pinned package exports one. */
  default: OmpSettingValueSchema,
  /** Whether a config layer or environment variable supplies a value. */
  configured: z.boolean(),
  enumValues: z.array(z.string().min(1)).optional(),
  options: z.array(OmpSettingOptionSchema).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  tab: z.string().min(1).optional(),
  /** Placement of this setting across GUI surfaces. */
  placement: OmpSettingPlacementSchema,
  /** OMP's `ui.condition` name or an availability condition applied by the host. */
  condition: z.string().min(1).optional(),
  /** Whether that condition holds in the snapshot that carried this row. */
  conditionActive: z.boolean().optional(),
}).refine(
  (setting) => setting.condition === undefined || setting.conditionActive !== undefined,
  'A conditional setting reports whether its condition holds',
);
export type OmpSetting = z.infer<typeof OmpSettingSchema>;

export const OmpSettingsStateSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  revision: CounterSchema,
  /**
   * Absolute path of the OMP config file these settings write, so the page can
   * offer the file itself instead of a second renderer for internals. Absent
   * when the runtime keeps its config in memory.
   */
  configPath: z.string().min(1).optional(),
  totalCount: z.number().int().nonnegative(),
  settings: z.array(OmpSettingSchema),
}).refine((state) => new Set(state.settings.map((setting) => setting.id)).size === state.settings.length,
  'OMP setting ids are unique');
export type OmpSettingsState = z.infer<typeof OmpSettingsStateSchema>;

export const OmpSettingsChangeSchema = z.strictObject({
  id: OmpSettingIdSchema,
  value: OmpSettingValueSchema,
});
export type OmpSettingsChange = z.infer<typeof OmpSettingsChangeSchema>;

export const OmpSettingsUpdateRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  changes: z.array(OmpSettingsChangeSchema).min(1),
}).refine((request) => new Set(request.changes.map((change) => change.id)).size === request.changes.length,
  'OMP setting changes name each setting once');
export type OmpSettingsUpdateRequest = z.infer<typeof OmpSettingsUpdateRequestSchema>;
