import type { Duplex } from 'node:stream';

export const REQUIRED_PLACE_METHODS = ['check', 'create', 'list', 'exec', 'execArgv', 'connect', 'stop', 'start', 'remove', 'verify'] as const;

export type PlaceCheckResult =
  | { available: true; version: string; os: string; arch: string; hostIsolation: boolean }
  | { available: false; code: string; message: string };

export interface SpaceSpec {
  id: string;
  name: string;
  project: string;
  created: string;
  memoryBytes: number;
}

export interface PlaceOrphan {
  kind: string;
  name: string;
}

export interface ListedSpace {
  id: string;
  name: string;
  project: string;
  created: string;
  state: 'running' | 'exited' | 'missing';
  stoppedIdle: boolean;
  gatekeeperRunning: boolean;
  orphans: PlaceOrphan[];
  damaged: boolean;
  missing: string[];
}

export interface PlaceExecOptions {
  stdin?: string | Buffer | undefined;
  timeoutMs?: number | undefined;
  target?: string | undefined;
  maxOutputBytes?: number | undefined;
  keepTail?: boolean | undefined;
  killTree?: boolean | undefined;
}

export interface PlaceExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface PlaceRemovalEntry {
  kind: string;
  name: string;
}

export interface PlaceRemovalFailure {
  kind: string;
  name: string;
  message: string;
}

export interface PlaceRemoveResult {
  removed: PlaceRemovalEntry[];
  failed: PlaceRemovalFailure[];
}

export interface PlaceViolation {
  check: string;
  message: string;
}

export interface PlaceImageFailure {
  code: string;
  message: string;
}

export interface PlaceDiskReadResult {
  imageBytes: number | null;
  imagePulling: boolean;
  imageFailure: PlaceImageFailure | null;
  toolsBytes: number;
  spacesBytes: number;
  freeBytes: number;
  freesImage: boolean;
}

export interface PlaceDiskKeptEntry {
  kind: string;
  name: string;
  reason: 'in_use' | 'failed';
  message: string;
}

export type PlaceDiskMachineTrimResult =
  | { state: 'skipped' }
  | { state: 'trimmed' }
  | { state: 'failed'; message: string };

export interface PlaceDiskCleanUpResult {
  freedBytes: number;
  kept: PlaceDiskKeptEntry[];
  machine: PlaceDiskMachineTrimResult;
}

export interface SpacePlace {
  id: string;
  check: () => Promise<PlaceCheckResult>;
  create: (spec: SpaceSpec) => Promise<void>;
  list: () => Promise<ListedSpace[]>;
  exec: (spaceId: string, argv: readonly string[], options?: PlaceExecOptions) => Promise<PlaceExecResult>;
  execArgv: (spaceId: string) => Promise<string[]>;
  connect: (spaceId: string) => Promise<Duplex>;
  stop: (spaceId: string) => Promise<void>;
  start: (spaceId: string) => Promise<void>;
  remove: (spaceId: string) => Promise<PlaceRemoveResult>;
  verify: (spaceId: string) => Promise<PlaceViolation[]>;
  pullImage?: (() => Promise<void>) | undefined;
  imagePulling?: (() => boolean) | undefined;
  readDisk?: (() => Promise<PlaceDiskReadResult>) | undefined;
  cleanUpDisk?: (() => Promise<PlaceDiskCleanUpResult>) | undefined;
}

export function createPlaceRegistry(initialPlaces: readonly SpacePlace[] = []) {
  const places = new Map<string, SpacePlace>();
  let sealed = false;

  const register = (place: SpacePlace): SpacePlace => {
    if (sealed) {
      throw new Error('Place registry is sealed; no further registrations allowed');
    }
    const key = String(place?.id ?? '').trim().toLowerCase();
    if (key.length === 0) {
      throw new Error('Place must define a non-empty id');
    }
    for (const method of REQUIRED_PLACE_METHODS) {
      if (!(place[method] instanceof Function)) {
        throw new Error(`Place '${key}' must implement ${method}()`);
      }
    }
    if (places.has(key)) {
      throw new Error(`Place '${key}' is already registered`);
    }
    places.set(key, place);
    return place;
  };

  const get = (placeId: string | null | undefined): SpacePlace | null =>
    places.get(String(placeId ?? '').trim().toLowerCase()) ?? null;

  const list = (): SpacePlace[] => Array.from(places.values());

  for (const place of initialPlaces) {
    register(place);
  }

  const seal = (): void => { sealed = true; };

  return {
    register,
    get,
    list,
    seal,
  };
}

export type SpacePlaceRegistry = ReturnType<typeof createPlaceRegistry>;
