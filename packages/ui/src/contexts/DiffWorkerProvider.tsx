import React, { useEffect, useSyncExternalStore } from 'react';
import type { HighlighterTypes, SupportedLanguages } from '@pierre/diffs';
import type { WorkerPoolManager } from '@pierre/diffs/worker';

import { useOptionalThemeSystem } from './useThemeSystem';
import { getDefaultTheme } from '@/lib/theme/themes';
import type { Theme } from '@/types/theme';

const PRELOAD_LANGS: SupportedLanguages[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'markdown',
];

interface DiffWorkerProviderProps {
  children: React.ReactNode;
}

type WorkerPoolStyle = 'unified' | 'split';
export type WorkerPoolStatus = 'pending' | 'ready' | 'failed';
export interface WorkerPoolState {
  status: WorkerPoolStatus;
  pool: WorkerPoolManager | undefined;
}
type InternalPoolStatus = 'idle' | WorkerPoolStatus;

const WORKER_POOL_STYLES: readonly WorkerPoolStyle[] = ['unified', 'split'];

const MAIN_THREAD_MAX_CHARACTERS = 64 * 1024;

interface WorkerPoolConfigEntry {
  poolSize: number;
  totalASTLRUCacheSize: number;
  lineDiffType: 'none' | 'word-line';
}

const WORKER_POOL_CONFIG = {
  unified: {
    poolSize: 1,
    totalASTLRUCacheSize: 24,
    lineDiffType: 'none',
  },
  split: {
    poolSize: 2,
    totalASTLRUCacheSize: 56,
    lineDiffType: 'word-line',
  },
} satisfies Record<WorkerPoolStyle, WorkerPoolConfigEntry>;

interface RenderTheme {
  light: string;
  dark: string;
}

type PoolModules = {
  WorkerPoolManager: typeof WorkerPoolManager;
  workerFactory: () => Worker;
  ensurePierreThemeRegistered: (theme: Theme) => string;
  highlighter: HighlighterTypes;
};

let poolModulesPromise: Promise<PoolModules> | null = null;
let hasLoggedWorkerFailure = false;
let workerInitTimeoutOverride: number | undefined;
let poolLifecycleGeneration = 0;

const logWorkerFailureOnce = (cause: unknown): void => {
  if (hasLoggedWorkerFailure) return;
  hasLoggedWorkerFailure = true;
  console.warn('[DiffWorkerProvider] Diff worker pool unavailable; falling back to main-thread rendering.', cause);
};

const terminatePoolSafely = (pool: WorkerPoolManager | undefined): void => {
  if (!pool) return;
  try {
    pool.terminate();
  } catch {
    // Ignore termination errors on failed or disposed pool
  }
};

const loadPoolModules = (): Promise<PoolModules> => {
  poolModulesPromise ??= Promise.all([
    import('@pierre/diffs/worker'),
    import('@/lib/diff/workerFactory').then(({ workerFactory }) => workerFactory),
    import('@/lib/shiki/appThemeRegistry'),
    import('@/lib/shiki/diffsHighlighter'),
<<<<<<< HEAD
  ])
    .then(([workerModule, factoryModule, themeRegistryModule, highlighterModule]) => ({
      WorkerPoolManager: workerModule.WorkerPoolManager,
      workerFactory: factoryModule.workerFactory,
      ensurePierreThemeRegistered: themeRegistryModule.ensurePierreThemeRegistered,
      highlighter: highlighterModule.DIFFS_HIGHLIGHTER,
    }))
    .catch((cause: unknown) => {
      poolModulesPromise = null;
      throw cause;
    });
||||||| bc50ba56aa
  ]).then(([workerModule, factoryModule, themeRegistryModule, highlighterModule]) => ({
    WorkerPoolManager: workerModule.WorkerPoolManager,
    workerFactory: factoryModule.workerFactory,
    ensurePierreThemeRegistered: themeRegistryModule.ensurePierreThemeRegistered,
    highlighter: highlighterModule.DIFFS_HIGHLIGHTER,
  }));
=======
  ]).then(([workerModule, workerFactory, themeRegistryModule, highlighterModule]) => ({
    WorkerPoolManager: workerModule.WorkerPoolManager,
    workerFactory,
    ensurePierreThemeRegistered: themeRegistryModule.ensurePierreThemeRegistered,
    highlighter: highlighterModule.DIFFS_HIGHLIGHTER,
  }));
>>>>>>> upstream/main
  return poolModulesPromise;
};

interface PoolStatusByStyle {
  unified: InternalPoolStatus;
  split: InternalPoolStatus;
}
interface PoolSnapshotsByStyle {
  unified: WorkerPoolState;
  split: WorkerPoolState;
}
const pools: Partial<Record<WorkerPoolStyle, WorkerPoolManager>> = {};
const poolStates: PoolStatusByStyle = {
  unified: 'idle',
  split: 'idle',
};
const cachedSnapshots: PoolSnapshotsByStyle = {
  unified: { status: 'pending', pool: undefined },
  split: { status: 'pending', pool: undefined },
};
const SERVER_POOL_STATE: WorkerPoolState = { status: 'pending', pool: undefined };
const poolsRequested = new Set<WorkerPoolStyle>();
const poolListeners = new Set<() => void>();

const DEFAULT_RENDER_THEME: RenderTheme = {
  light: 'pierre-light',
  dark: 'pierre-dark',
};

let currentRenderTheme: RenderTheme = { ...DEFAULT_RENDER_THEME };

const notifyPoolListeners = () => {
  for (const listener of poolListeners) listener();
};

const setPoolState = (
  style: WorkerPoolStyle,
  status: InternalPoolStatus,
  pool: WorkerPoolManager | undefined,
): void => {
  poolStates[style] = status;
  if (pool) {
    pools[style] = pool;
  } else {
    delete pools[style];
  }
  const exposedStatus: WorkerPoolStatus = status === 'idle' ? 'pending' : status;
  const prev = cachedSnapshots[style];
  if (prev.status !== exposedStatus || prev.pool !== pool) {
    cachedSnapshots[style] = { status: exposedStatus, pool };
    notifyPoolListeners();
  }
};

const evictFailedPool = (style: WorkerPoolStyle, pool: WorkerPoolManager, cause: unknown): void => {
  logWorkerFailureOnce(cause);
  terminatePoolSafely(pool);
  if (pools[style] === pool) {
    setPoolState(style, 'failed', undefined);
  }
};

const applyRenderOptions = (style: WorkerPoolStyle, pool: WorkerPoolManager): Promise<void> => {
  const generation = poolLifecycleGeneration;
  return pool
    .setRenderOptions({
      theme: currentRenderTheme,
      lineDiffType: WORKER_POOL_CONFIG[style].lineDiffType,
    })
    .then(() => {
      if (generation !== poolLifecycleGeneration) return;
      if (!pool.isWorkingPool()) {
        evictFailedPool(style, pool, new Error(`Diff worker pool (${style}) stopped working after setRenderOptions`));
      }
    })
    .catch((cause: unknown) => {
      if (generation !== poolLifecycleGeneration) return;
      evictFailedPool(style, pool, cause);
    });
};

const ensurePool = (style: WorkerPoolStyle): void => {
  if (globalThis.window === undefined || poolsRequested.has(style)) return;
  poolsRequested.add(style);
<<<<<<< HEAD
  setPoolState(style, 'pending', undefined);
  const generation = poolLifecycleGeneration;
  void loadPoolModules()
    .then(async (modules) => {
      if (generation !== poolLifecycleGeneration || pools[style]) return;
      const config = WORKER_POOL_CONFIG[style];
      const pool = new modules.WorkerPoolManager(
        {
          workerFactory: modules.workerFactory,
          poolSize: config.poolSize,
          totalASTLRUCacheSize: config.totalASTLRUCacheSize,
          // Highlights tokenizes this much in about a millisecond, less than a
          // worker round trip, so small files and diffs paint highlighted in
          // their first frame. Shiki is slower but the threshold stays small.
          mainThreadMaxCharacters: MAIN_THREAD_MAX_CHARACTERS,
          workerInitializationTimeout: workerInitTimeoutOverride,
          onWorkerError: (event) => {
            event.preventDefault();
          },
||||||| bc50ba56aa
  void loadPoolModules().then((modules) => {
    if (pools[style]) return;
    const config = WORKER_POOL_CONFIG[style];
    const pool = new modules.WorkerPoolManager(
      {
        workerFactory: modules.workerFactory,
        poolSize: config.poolSize,
        totalASTLRUCacheSize: config.totalASTLRUCacheSize,
        // Highlights tokenizes this much in about a millisecond, less than a
        // worker round trip, so small files and diffs paint highlighted in
        // their first frame. Shiki is slower but the threshold stays small.
        mainThreadMaxCharacters: MAIN_THREAD_MAX_CHARACTERS,
      },
      {
        theme: {
          light: 'pierre-light',
          dark: 'pierre-dark',
=======
  void loadPoolModules().then((modules) => {
    if (pools[style]) return;
    const config = WORKER_POOL_CONFIG[style];
    const pool = new modules.WorkerPoolManager(
      {
        workerFactory: modules.workerFactory,
        poolSize: config.poolSize,
        totalASTLRUCacheSize: config.totalASTLRUCacheSize,
        mainThreadMaxCharacters: MAIN_THREAD_MAX_CHARACTERS,
      },
      {
        theme: {
          light: 'pierre-light',
          dark: 'pierre-dark',
>>>>>>> upstream/main
        },
        {
          theme: {
            light: 'pierre-light',
            dark: 'pierre-dark',
          },
          langs: PRELOAD_LANGS,
          lineDiffType: config.lineDiffType,
          preferredHighlighter: modules.highlighter,
        }
      );
      try {
        await pool.initialize();
        if (generation !== poolLifecycleGeneration) {
          terminatePoolSafely(pool);
          return;
        }
        if (!pool.isWorkingPool()) {
          logWorkerFailureOnce(new Error(`Diff worker pool (${style}) failed to initialize`));
          terminatePoolSafely(pool);
          setPoolState(style, 'failed', undefined);
          return;
        }
        await pool.setRenderOptions({
          theme: currentRenderTheme,
          lineDiffType: config.lineDiffType,
        });
        if (generation !== poolLifecycleGeneration) {
          terminatePoolSafely(pool);
          return;
        }
        if (!pool.isWorkingPool()) {
          logWorkerFailureOnce(new Error(`Diff worker pool (${style}) failed to configure render options`));
          terminatePoolSafely(pool);
          setPoolState(style, 'failed', undefined);
          return;
        }
        setPoolState(style, 'ready', pool);
      } catch (cause: unknown) {
        if (generation !== poolLifecycleGeneration) {
          terminatePoolSafely(pool);
          return;
        }
        logWorkerFailureOnce(cause);
        terminatePoolSafely(pool);
        setPoolState(style, 'failed', undefined);
      }
    })
    .catch((cause: unknown) => {
      if (generation !== poolLifecycleGeneration) return;
      logWorkerFailureOnce(cause);
      setPoolState(style, 'failed', undefined);
    });
};

const subscribeToPools = (listener: () => void): (() => void) => {
  poolListeners.add(listener);
  return () => poolListeners.delete(listener);
};

const setRenderTheme = (renderTheme: RenderTheme) => {
  if (currentRenderTheme.light === renderTheme.light && currentRenderTheme.dark === renderTheme.dark) {
    return;
  }
  currentRenderTheme = renderTheme;
  for (const style of WORKER_POOL_STYLES) {
    const pool = pools[style];
    if (pool) void applyRenderOptions(style, pool);
  }
};

interface DiffWorkerProviderComponent extends React.FC<DiffWorkerProviderProps> {
  _setWorkerInitTimeoutForTesting?: (timeout: number | undefined) => void;
  _resetPoolsForTesting?: () => void;
}

export const DiffWorkerProvider: DiffWorkerProviderComponent = ({ children }) => {
  const themeSystem = useOptionalThemeSystem();

  const fallbackLight = getDefaultTheme(false);
  const fallbackDark = getDefaultTheme(true);

  const lightThemeId = themeSystem?.lightThemeId ?? fallbackLight.metadata.id;
  const darkThemeId = themeSystem?.darkThemeId ?? fallbackDark.metadata.id;

  const lightTheme =
    themeSystem?.availableThemes.find((theme) => theme.metadata.id === lightThemeId) ??
    fallbackLight;
  const darkTheme =
    themeSystem?.availableThemes.find((theme) => theme.metadata.id === darkThemeId) ??
    fallbackDark;

  useEffect(() => {
    let cancelled = false;
    const generation = poolLifecycleGeneration;
    void loadPoolModules()
      .then((modules) => {
        if (cancelled || generation !== poolLifecycleGeneration) return;
        setRenderTheme({
          light: modules.ensurePierreThemeRegistered(lightTheme),
          dark: modules.ensurePierreThemeRegistered(darkTheme),
        });
      })
      .catch((cause: unknown) => {
        if (cancelled || generation !== poolLifecycleGeneration) return;
        logWorkerFailureOnce(cause);
      });
    return () => {
      cancelled = true;
    };
  }, [darkTheme, lightTheme]);

  useEffect(() => {
    if (globalThis.window === undefined) return;
    const warm = () => {
      ensurePool('unified');
      ensurePool('split');
      void import('@/components/chat/markdown/highlightsEngine')
        .then(({ loadHighlights }) => loadHighlights())
        .catch(() => {
          // Non-fatal warmup failure; markdown code blocks render plain until loaded on demand.
        });
    };
    const scheduleIdle = window.requestIdleCallback?.bind(window);
    if (scheduleIdle) {
      const handle = scheduleIdle(warm, { timeout: 5000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timeout = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timeout);
  }, []);

  return <>{children}</>;
};

DiffWorkerProvider._setWorkerInitTimeoutForTesting = (timeout: number | undefined): void => {
  workerInitTimeoutOverride = timeout;
};

DiffWorkerProvider._resetPoolsForTesting = (): void => {
  poolLifecycleGeneration += 1;
  workerInitTimeoutOverride = undefined;
  poolModulesPromise = null;
  hasLoggedWorkerFailure = false;
  currentRenderTheme = { ...DEFAULT_RENDER_THEME };
  for (const style of WORKER_POOL_STYLES) {
    terminatePoolSafely(pools[style]);
    delete pools[style];
    poolStates[style] = 'idle';
    cachedSnapshots[style] = { status: 'pending', pool: undefined };
  }
  poolsRequested.clear();
  poolListeners.clear();
};

// oxlint-disable-next-line react/only-export-components
export const useWorkerPoolState = (style: WorkerPoolStyle = 'unified'): WorkerPoolState => {
  const state = useSyncExternalStore(
    subscribeToPools,
    () => cachedSnapshots[style],
    () => SERVER_POOL_STATE,
  );
  useEffect(() => {
    ensurePool(style);
  }, [style]);
  return state;
};

// oxlint-disable-next-line react/only-export-components
export const useWorkerPool = (style: WorkerPoolStyle = 'unified'): WorkerPoolManager | undefined =>
  useWorkerPoolState(style).pool;
