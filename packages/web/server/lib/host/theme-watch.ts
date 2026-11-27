import { watch } from 'node:fs';
import type nodeFsPromises from 'node:fs/promises';
import type nodePath from 'node:path';

export interface FolderWatchTimer {
  unref?: () => void;
}

export interface FolderWatchTimers<Timer extends FolderWatchTimer> {
  setTimeout: (callback: () => void | Promise<void>, delay: number) => Timer;
  setInterval: (callback: () => void | Promise<void>, delay: number) => Timer;
  clearTimeout: (timer: Timer | undefined) => void;
  clearInterval: (timer: Timer) => void;
}

interface FolderWatcher {
  close: () => void;
  on: (event: 'error' | 'close', listener: () => void) => FolderWatcher;
}

interface FolderChangeWatchOptions {
  root: string;
  fingerprint: () => Promise<string>;
  onChange: () => void;
  pollMs?: number;
  recursive?: boolean;
  fsWatch?: ((root: string, options: { recursive: boolean; persistent: boolean }, listener: () => void) => FolderWatcher) | undefined;
  logger?: Pick<Console, 'warn'>;
}

export interface ThemeFolderWatchOptions<Timer extends FolderWatchTimer = ReturnType<typeof setTimeout>> {
  fsPromises: Pick<typeof nodeFsPromises, 'readdir' | 'stat'>;
  path: Pick<typeof nodePath, 'join'>;
  themesDir: string;
  onChange: () => void;
  pollMs?: number;
  logger?: Pick<Console, 'warn'>;
  fsWatch?: ((root: string, options: { recursive: boolean; persistent: boolean }, listener: () => void) => FolderWatcher) | undefined;
  timers?: FolderWatchTimers<Timer> | undefined;
}

const SAFETY_POLL_MS = 30_000;
const POLL_MS = 1000;

const hasWatchErrorMessage = (error: unknown): error is { message?: unknown } => (
  error !== null && (typeof error === 'object' || typeof error === 'function')
);

const watchFolder = <Timer extends FolderWatchTimer>({
  root,
  fingerprint,
  onChange,
  pollMs = POLL_MS,
  recursive = false,
  fsWatch = watch,
  logger = console,
}: FolderChangeWatchOptions, timers: FolderWatchTimers<Timer>) => {
  let watcher: FolderWatcher | null = null;
  let pending: Timer | null = null;
  let running: Promise<void> | null = null;
  let stopped = false;
  let reported: string | null = null;
  let seen: string | null = null;

  const schedule = () => {
    if (stopped || pending !== null) return;
    pending = timers.setTimeout(() => {
      pending = null;
      return check();
    }, pollMs);
    pending.unref?.();
  };

  const check = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (running) {
      schedule();
      return running;
    }
    running = (async () => {
      try {
        const current = await fingerprint();
        if (stopped) return;
        if (reported === null) {
          reported = seen = current;
          return;
        }
        const settled = current === seen;
        seen = current;
        if (!settled) schedule();
        else if (current !== reported) {
          reported = current;
          onChange();
        }
      } catch (error) {
        logger.warn('Failed to check a watched folder:', (hasWatchErrorMessage(error) ? error.message : undefined) ?? error);
      } finally {
        running = null;
        if (!watcher) schedule();
      }
    })();
    return running;
  };

  const closeWatcher = () => {
    const previous = watcher;
    watcher = null;
    previous?.close();
  };

  const arm = () => {
    closeWatcher();
    if (stopped) return;
    try {
      const next = fsWatch(root, { recursive, persistent: false }, schedule);
      watcher = next;
      next.on('error', () => {
        if (watcher !== next) return;
        closeWatcher();
        schedule();
      });
      next.on('close', () => {
        if (watcher !== next) return;
        watcher = null;
        schedule();
      });
    } catch {
      schedule();
    }
  };

  arm();
  const ready = check();
  const safety = timers.setInterval(() => {
    arm();
    return check();
  }, SAFETY_POLL_MS);
  safety.unref?.();

  return {
    ready,
    check,
    stop: () => {
      stopped = true;
      closeWatcher();
      if (pending !== null) {
        timers.clearTimeout(pending);
        pending = null;
      }
      timers.clearInterval(safety);
    },
  };
};

const createFolderChangeWatch = <Timer extends FolderWatchTimer = ReturnType<typeof setTimeout>>(
  options: FolderChangeWatchOptions & { timers?: FolderWatchTimers<Timer> | undefined },
) => (options.timers === undefined
  ? watchFolder(options, globalThis)
  : watchFolder(options, options.timers));

export const createThemeFolderWatch = <Timer extends FolderWatchTimer = ReturnType<typeof setTimeout>>({
  fsPromises,
  path,
  themesDir,
  onChange,
  pollMs = POLL_MS,
  logger = console,
  fsWatch,
  timers,
}: ThemeFolderWatchOptions<Timer>) => {
  const fingerprint = async () => {
    const names = await fsPromises.readdir(themesDir).catch(() => []);
    const themes = names.filter((name) => name.toLowerCase().endsWith('.json')).sort();
    const stamps = await Promise.all(themes.map((name) => fsPromises.stat(path.join(themesDir, name)).then(
      (stat) => `${stat.mtimeMs}:${stat.size}`,
      () => 'missing',
    )));
    return themes.map((name, index) => `${name}=${stamps[index]}`).join('\n');
  };

  return createFolderChangeWatch({ root: themesDir, fingerprint, onChange, pollMs, logger, fsWatch, timers });
};
