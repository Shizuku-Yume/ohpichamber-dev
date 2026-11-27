import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { requireSpaceId } from './labels.js';
import { MAX_KEPT_OUTPUT_CHARACTERS, MAX_SETUP_COMMAND_LENGTH, MAX_SETUP_COMMANDS } from './space-setup.js';

const RECORDS_DIRECTORY = path.join('spaces', 'records');

const NETWORK_MODES = ['allowlist', 'open'] as const;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const MAX_DOMAINS = 200;

export const domainSchema = z.string().regex(DOMAIN_PATTERN);

export const networkSchema = z.object({
  mode: z.enum(NETWORK_MODES),
  domains: z.array(domainSchema).max(MAX_DOMAINS).default([]),
});

const historySchema = z.enum(['pending', 'sent', 'already_complete', 'host_shallow', 'failed']);

const GRANT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const isHttpUrl = (value: string): boolean => {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
};
const upstreamSchema = z.string().url().refine(isHttpUrl, 'http or https');

export const secretSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('env'), name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,255}$/) }).strict(),
  z.object({ kind: z.literal('typed') }).strict(),
]);

export const grantSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('model'),
    id: z.string().regex(GRANT_ID_PATTERN),
    provider: z.string().regex(GRANT_ID_PATTERN),
    upstream: upstreamSchema,
    header: z.string().regex(/^[a-z0-9-]{1,64}$/),
    source: secretSourceSchema,
  }).strict(),
  z.object({
    kind: z.literal('domain'),
    id: z.string().regex(GRANT_ID_PATTERN),
    upstream: upstreamSchema,
  }).strict(),
]);
const MAX_GRANTS = 100;

const setupCountSchema = z.number().int().min(1).max(MAX_SETUP_COMMANDS);
const setupSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('running'), total: setupCountSchema, startedAt: z.string() }).strict(),
  z.object({ state: z.literal('done'), total: setupCountSchema, finishedAt: z.string() }).strict(),
  z.object({
    state: z.literal('failed'),
    total: setupCountSchema,
    index: z.number().int().min(0).max(MAX_SETUP_COMMANDS - 1),
    command: z.string().max(MAX_SETUP_COMMAND_LENGTH),
    exitCode: z.number().int().nullable(),
    timedOut: z.boolean(),
    output: z.string().max(MAX_KEPT_OUTPUT_CHARACTERS),
    startedAt: z.string().optional(),
    finishedAt: z.string(),
  }).strict(),
]);

const recordSchema = z.object({
  version: z.literal(1),
  network: networkSchema,
  repository: z.string().min(1).nullable().default(null),
  spacePath: z.string().min(1).nullable().default(null),
  base: z.string().regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/).nullable().default(null),
  history: historySchema.default('pending'),
  grants: z.array(grantSchema).max(MAX_GRANTS).default([]),
  setup: setupSchema.nullable().default(null),
});

const rawRecordEnvelopeSchema = z.looseObject({
  grants: z.array(z.unknown()).optional(),
  setup: z.unknown().optional(),
});

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export type SpaceNetwork = z.infer<typeof networkSchema>;
export type SpaceSecretSource = z.infer<typeof secretSourceSchema>;
export type SpaceGrant = z.infer<typeof grantSchema>;
export type SpaceRecordSetup = z.infer<typeof setupSchema>;
export type SpaceHistoryStatus = z.infer<typeof historySchema>;
export type SpaceRecord = z.infer<typeof recordSchema>;
export type SpaceRecordWriteInput = Omit<z.input<typeof recordSchema>, 'version'> & { version?: 1 | undefined };

export type SpaceRecordReadResult =
  | { status: 'ok'; record: SpaceRecord }
  | { status: 'missing'; record: null }
  | { status: 'unreadable'; record: null };

export interface SpaceRecordsLogger {
  warn?: ((message: string) => void) | undefined;
}

export interface SpaceRecordsDependencies {
  dataDir: string;
  logger?: SpaceRecordsLogger | undefined;
}

export function createSpaceRecords({ dataDir, logger = console }: SpaceRecordsDependencies) {
  const directory = path.join(dataDir, RECORDS_DIRECTORY);
  const fileOf = (spaceId: string): string => path.join(directory, `${requireSpaceId(spaceId)}.json`);

  const sanitizeRawRecord = (spaceId: string, parsedJson: z.infer<typeof rawRecordEnvelopeSchema>) => {
    let sanitized = parsedJson;
    if (Array.isArray(sanitized.grants)) {
      const grants = sanitized.grants.filter((grant) => grantSchema.safeParse(grant).success);
      if (grants.length < sanitized.grants.length) {
        logger.warn?.(`[spaces] the record of space ${spaceId} holds ${sanitized.grants.length - grants.length} grant(s) this host cannot read; they are left out`);
      }
      sanitized = { ...sanitized, grants };
    }
    if (sanitized.setup !== undefined && sanitized.setup !== null && !setupSchema.safeParse(sanitized.setup).success) {
      logger.warn?.(`[spaces] the record of space ${spaceId} holds a setup this host cannot read; it is left out`);
      sanitized = { ...sanitized, setup: null };
    }
    return sanitized;
  };

  const read = (spaceId: string): SpaceRecordReadResult => {
    const file = fileOf(spaceId);
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      if (detail?.code === 'ENOENT') return { status: 'missing', record: null };
      logger.warn?.(`[spaces] could not read the record of space ${spaceId}: ${detail?.code ?? detail?.message ?? error}`);
      return { status: 'unreadable', record: null };
    }
    try {
      const envelope = rawRecordEnvelopeSchema.safeParse(JSON.parse(text));
      if (envelope.success) {
        const parsed = recordSchema.safeParse(sanitizeRawRecord(spaceId, envelope.data));
        if (parsed.success) return { status: 'ok', record: parsed.data };
      }
    } catch {
      logger.warn?.(`[spaces] the record of space ${spaceId} is not one this host wrote`);
      return { status: 'unreadable', record: null };
    }
    logger.warn?.(`[spaces] the record of space ${spaceId} is not one this host wrote`);
    return { status: 'unreadable', record: null };
  };

  const write = (spaceId: string, record: SpaceRecordWriteInput): SpaceRecord => {
    const checked = recordSchema.parse({ version: 1, ...record });
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = fileOf(spaceId);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
    return checked;
  };

  const update = (spaceId: string, changes: Partial<Omit<SpaceRecord, 'version'>>): SpaceRecordReadResult => {
    const current = read(spaceId);
    if (current.status !== 'ok') return current;
    return { status: 'ok', record: write(spaceId, { ...current.record, ...changes }) };
  };

  const remove = (spaceId: string): void => {
    try {
      fs.rmSync(fileOf(spaceId), { force: true });
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      logger.warn?.(`[spaces] could not remove the record of space ${spaceId}: ${detail?.code ?? detail?.message ?? error}`);
    }
  };

  return { read, write, update, remove };
}

export type SpaceRecordsStore = ReturnType<typeof createSpaceRecords>;
