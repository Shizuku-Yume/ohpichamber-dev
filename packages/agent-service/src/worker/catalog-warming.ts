import { join } from 'node:path';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import { cfgProvidersCacheWarming } from '@oh-my-pi/pi-coding-agent/session/settings';
import {
  CacheWarmingModeSchema, CacheWarmingStateSchema, PositiveCounterSchema,
  type CacheWarmingMode, type CacheWarmingState,
} from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';

export type NativeCacheWarmingContext = {
  cwd: string;
  agentDirectory: string;
  session?: Pick<AgentSession, 'setCacheWarmingMode'>;
};

export class NativeCacheWarming {
  constructor(private readonly context: NativeCacheWarmingContext) {}

  async read(workspaceId: string, revision: string): Promise<CacheWarmingState> {
    // Read the same native layers as the session, without opening storage or watchers.
    const identity = CacheWarmingStateSchema.parse({ workspaceId, revision, mode: 'idle' });
    try {
      const settings = await Settings.loadReadOnly({ cwd: this.context.cwd, agentDir: this.context.agentDirectory });
      return CacheWarmingStateSchema.parse({ ...identity, mode: cfgProvidersCacheWarming.get(settings) });
    } catch {
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native cache warming settings could not be read');
    }
  }

  async persist(workspaceId: string, mode: CacheWarmingMode, revision: string): Promise<CacheWarmingState> {
    const state = CacheWarmingStateSchema.parse({ workspaceId, revision, mode });
    PositiveCounterSchema.parse(revision);
    // Setting.set writes its instance's global config. Scope that writer to the native
    // project config, not the shared user agent directory, so workspace CAS owns the write.
    let settings: Settings | undefined;
    try {
      settings = await Settings.loadIsolated({ cwd: this.context.cwd, agentDir: join(this.context.cwd, '.omp') });
      cfgProvidersCacheWarming.set(settings, state.mode);
      await settings.flush();
    } catch {
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native cache warming settings could not be persisted');
    } finally {
      settings?.cancelPendingSaves();
    }
    // The native writer can decline a conflicting external edit. Reopen rather than
    // reporting its staged value as committed, and include normal native precedence.
    const persisted = await this.read(workspaceId, revision);
    if (persisted.mode !== mode) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Native cache warming settings do not match the requested mode');
    }
    return persisted;
  }

  apply(input: CacheWarmingMode): CacheWarmingMode {
    const mode = CacheWarmingModeSchema.parse(input);
    if (!this.context.session) {
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'No native session is available to apply cache warming');
    }
    try {
      const applied = CacheWarmingModeSchema.parse(this.context.session.setCacheWarmingMode(mode));
      if (applied !== mode) throw new Error('Native cache warming override was not applied');
      return applied;
    } catch {
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native cache warming mode could not be applied to the live session');
    }
  }
}
