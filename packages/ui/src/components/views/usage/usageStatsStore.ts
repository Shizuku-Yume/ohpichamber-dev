import React from 'react';
import { create } from 'zustand';

import type { UsageStats, UsageToolsResponse } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';

import { isSameLocalDay, rangeStart, type UsageRange } from './usageStatsModel';

/**
 * In-memory cache of Stats page reports for the app session, one entry per
 * (runtime, range, project). Reopening the page or going back to a filter
 * shows the cached report without refetching; only a key with nothing cached
 * loads on its own, and the refresh button forces a new read. A runtime
 * switch drops every entry and ignores answers still in flight.
 *
 * `7d`/`30d` are relative to now: an entry reports the range it was fetched
 * for (`stats.range`) and when (`fetchedAt`), which the page shows.
 *
 * `1d` is the one range that expires: its name says today, so a report read on
 * an earlier local day is dropped and read again, whether or not it was forced.
 */

export type UsageStatsRequest = { range: UsageRange; projectDirectory: string | null; providerId?: string | null };
export type UsageStatsEntry = {
  stats: UsageStats | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
};

export type UsageStatsFetcher = (request: UsageStatsRequest, signal: AbortSignal) => Promise<UsageStats>;

export type UsageToolsEntry = {
  tools: UsageToolsResponse | null;
  loading: boolean;
  error: string | null;
};

export type UsageToolsFetcher = (
  request: UsageStatsRequest,
  range: UsageStats['range'],
  signal: AbortSignal,
) => Promise<UsageToolsResponse>;

export const usageStatsKey = (runtimeKey: string, request: UsageStatsRequest): string =>
  `${runtimeKey}::${request.range}::${request.projectDirectory ?? '__all__'}::${request.providerId ?? '__all__'}`;
type UsageStatsStore = {
  entries: Record<string, UsageStatsEntry>;
  selectedProvider: string | null;
  setSelectedProvider: (provider: string | null) => void;
  /**
   * Loads a report for the request under the current runtime. Without `force`
   * this only reads a key that has no report, no error and no read running,
   * or whose `1d` report is from an earlier local day.
   */
  load: (request: UsageStatsRequest, options?: { force?: boolean }) => Promise<void>;
  toolEntries: Record<string, UsageToolsEntry>;
  toolsRequested: boolean;
  loadTools: (request: UsageStatsRequest, options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
};

const viewerTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const fetchFromCanonical: UsageStatsFetcher = async ({ range, projectDirectory, providerId }, signal) => {
  const workspace = projectDirectory ? await canonicalClient.resolveWorkspace(projectDirectory, { signal }) : undefined;
  signal.throwIfAborted();
  const to = Date.now();
  return canonicalClient.getUsageStats({
    from: rangeStart(range, new Date(to)), to, timezone: viewerTimeZone(),
    workspaceId: workspace?.workspaceId, projectId: workspace?.projectId,
    providerId: providerId ?? undefined,
  }, { signal });
};

const fetchToolsFromCanonical: UsageToolsFetcher = async ({ projectDirectory }, window, signal) => {
  const workspace = projectDirectory ? await canonicalClient.resolveWorkspace(projectDirectory, { signal }) : undefined;
  return canonicalClient.getUsageTools({
    from: window.from, to: window.to, timezone: viewerTimeZone(),
    workspaceId: workspace?.workspaceId, projectId: workspace?.projectId
  }, { signal });
};

const isExpiredToday = (request: UsageStatsRequest, entry: UsageStatsEntry | undefined, at: number): boolean =>
  request.range === '1d' && entry?.fetchedAt != null && !isSameLocalDay(entry.fetchedAt, at);

export function createUsageStatsStore(
  fetcher: UsageStatsFetcher,
  runtimeKey: () => string,
  now: () => number = Date.now,
  toolsFetcher: UsageToolsFetcher = fetchToolsFromCanonical,
) {
  let controller = new AbortController();
  const currentToolReads = new Map<string, symbol>();

  return create<UsageStatsStore>()((set, get) => {
    const patch = (key: string, next: Partial<UsageStatsEntry>) =>
      set((state) => {
        const previous = state.entries[key] ?? { stats: null, fetchedAt: null, loading: false, error: null };
        return { entries: { ...state.entries, [key]: { ...previous, ...next } } };
      });

    const patchTools = (key: string, next: Partial<UsageToolsEntry>) =>
      set((state) => {
        const previous = state.toolEntries[key] ?? { tools: null, loading: false, error: null };
        return { toolEntries: { ...state.toolEntries, [key]: { ...previous, ...next } } };
      });

    return {
      entries: {},
      toolEntries: {},
      toolsRequested: false,
      selectedProvider: null,
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      load: async (request, options) => {
        const runtime = runtimeKey();
        const key = usageStatsKey(runtime, request);
        const entry = get().entries[key];
        if (entry?.loading) return;
        const startedAt = now();
        const expired = isExpiredToday(request, entry, startedAt);
        if (!options?.force && !expired && (entry?.stats || entry?.error)) return;

        const { signal } = controller;
        if (expired) {
          patch(key, { stats: null, fetchedAt: null, loading: true, error: null });
          currentToolReads.delete(key);
          set((state) => {
            const { [key]: _expiredTools, ...toolEntries } = state.toolEntries;
            return { toolEntries };
          });
        } else {
          patch(key, { loading: true });
        }
        try {
          const stats = await fetcher(request, signal);
          if (signal.aborted || runtimeKey() !== runtime) return;
          // Written under the key the read started for: switching filters
          // while it runs never lets it land on another filter.
          patch(key, { stats, fetchedAt: startedAt, loading: false, error: null });
          // A refreshed report moves the window: any tool read still in flight
          // answered for the old one and must not land, and the tools shown
          // follow the report that is now on screen.
          if (get().toolsRequested) {
            currentToolReads.delete(key);
            if (get().toolEntries[key]) patchTools(key, { loading: false });
            void get().loadTools(request, { force: true });
          }
        } catch (error) {
          if (signal.aborted || runtimeKey() !== runtime) return;
          // A failed read keeps the last report; it never becomes zeros.
          patch(key, { loading: false, error: error instanceof Error ? error.message : String(error) });
        }
      },

      loadTools: async (request, options) => {
        const runtime = runtimeKey();
        const key = usageStatsKey(runtime, request);
        const window = get().entries[key]?.stats?.range;
        if (!window) return;
        set({ toolsRequested: true });
        const entry = get().toolEntries[key];
        if (entry?.loading) return;
        if (!options?.force && (entry?.tools || entry?.error)) return;

        const { signal } = controller;
        const read = Symbol('usage tools read');
        currentToolReads.set(key, read);
        const isDropped = () => signal.aborted || runtimeKey() !== runtime || currentToolReads.get(key) !== read;
        // The report may have moved window without superseding this read (a
        // refresh that started after it): its answer names the old bounds.
        const windowMoved = () => get().entries[key]?.stats?.range !== window;
        patchTools(key, { loading: true });
        try {
          const tools = await toolsFetcher(request, window, signal);
          if (isDropped()) return;
          if (windowMoved()) {
            patchTools(key, { loading: false });
            void get().loadTools(request, { force: true });
            return;
          }
          patchTools(key, { tools, loading: false, error: null });
        } catch (error) {
          if (isDropped()) return;
          if (windowMoved()) {
            patchTools(key, { loading: false });
            void get().loadTools(request, { force: true });
            return;
          }
          patchTools(key, { loading: false, error: error instanceof Error ? error.message : String(error) });
        }
      },

      reset: () => {
        controller.abort();
        controller = new AbortController();
        set({ entries: {}, toolEntries: {}, selectedProvider: null });
      },
    };
  });
}

export const useUsageStatsStore = createUsageStatsStore(fetchFromCanonical, getRuntimeKey);

const TODAY_CHECK_INTERVAL_MS = 60_000;

export function useTodayRollover(enabled: boolean, load: () => void): void {
  React.useEffect(() => {
    if (!enabled) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = window.setInterval(load, TODAY_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, load]);
}

export const selectUsageToolsEntry = (
  state: Pick<UsageStatsStore, 'toolEntries'>,
  request: UsageStatsRequest,
): UsageToolsEntry | undefined => state.toolEntries[usageStatsKey(getRuntimeKey(), request)];

export const selectUsageStatsEntry = (
  state: Pick<UsageStatsStore, 'entries'>,
  request: UsageStatsRequest,
): UsageStatsEntry | undefined => state.entries[usageStatsKey(getRuntimeKey(), request)];

subscribeRuntimeEndpointChanged(() => useUsageStatsStore.getState().reset());
