import fs from 'node:fs';
import { z } from 'zod';

import type { SettingsDocument } from '../settings/settings-helpers.js';

const IDLE_STOP_MIN_HOURS = 1;
const IDLE_STOP_MAX_HOURS = 168;

export const idleStopSchema = z.object({
  enabled: z.boolean(),
  hours: z.number().int().min(IDLE_STOP_MIN_HOURS).max(IDLE_STOP_MAX_HOURS),
}).strict();

export type IdleStopSetting = z.infer<typeof idleStopSchema>;

export const DEFAULT_IDLE_STOP: Readonly<IdleStopSetting> = Object.freeze({ enabled: true, hours: 4 });

export const readIdleStopSetting = (value: SettingsDocument[string]): IdleStopSetting => {
  const parsed = idleStopSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_IDLE_STOP };
};

const HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_SETTING_BYTES = 1024;
const WORKING = new Set(['busy', 'retry']);

export interface IdleStopSessionState {
  status: string;
  lastUpdateAt: number;
}

export interface IdleStopPendingRequests {
  permissions?: { readonly length: number } | undefined;
  forms?: { readonly length: number } | undefined;
}

export interface IdleStopLogger {
  log?: ((message: string) => void) | undefined;
  warn?: ((message: string) => void) | undefined;
}

export interface CreateIdleStopOptions {
  settingsPath: string;
  readSessionStates: () => Record<string, IdleStopSessionState>;
  readPendingRequests?: (() => Record<string, IdleStopPendingRequests>) | undefined;
  stopSpace: () => Promise<void>;
  now?: (() => number) | undefined;
  logger?: IdleStopLogger | undefined;
}

export interface IdleStopController {
  check: () => Promise<boolean>;
}

export function createIdleStop({
  settingsPath,
  readSessionStates,
  readPendingRequests = () => ({}),
  stopSpace,
  now = Date.now,
  logger = console,
}: CreateIdleStopOptions): IdleStopController {
  let lastActive = now();
  let stopping = false;

  const readSetting = async (): Promise<IdleStopSetting | null> => {
    try {
      const stat = await fs.promises.lstat(settingsPath);
      if (!stat.isFile() || stat.size > MAX_SETTING_BYTES) return null;
      const parsed = idleStopSchema.safeParse(JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  const noteActivity = (): void => {
    const current = now();
    const pending = readPendingRequests();
    const waiting = (sessionId: string): boolean =>
      (pending[sessionId]?.permissions?.length ?? 0) + (pending[sessionId]?.forms?.length ?? 0) > 0;
    for (const [sessionId, state] of Object.entries(readSessionStates())) {
      if (WORKING.has(state.status) && !waiting(sessionId)) lastActive = current;
      else if (state.lastUpdateAt > lastActive) lastActive = Math.min(state.lastUpdateAt, current);
    }
  };

  const check = async (): Promise<boolean> => {
    if (stopping) return false;
    noteActivity();
    const setting = await readSetting();
    if (!setting?.enabled || now() - lastActive < setting.hours * HOUR_MS) return false;
    stopping = true;
    logger.log?.(`[spaces] no session worked for ${setting.hours} hours; the space stops itself`);
    await stopSpace();
    return true;
  };

  return { check };
}

export function startIdleStop(options: CreateIdleStopOptions): () => void {
  const idleStop = createIdleStop(options);
  const timer = setInterval(() => {
    idleStop.check().catch((cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      options.logger?.warn?.(`[spaces] the idle check failed: ${message}`);
    });
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
