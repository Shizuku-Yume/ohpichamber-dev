import { SpaceError } from './errors.js';
import { createSpaceId, hashProjectDirectory, normalizeSpaceName, requireSpaceId } from './labels.js';
import type {
  ListedSpace as PlaceSpaceEntry,
  PlaceCheckResult,
  PlaceDiskCleanUpResult,
  PlaceDiskKeptEntry as PlaceDiskKeptItem,
  PlaceDiskReadResult as PlaceDiskUsage,
  PlaceRemovalEntry as PlaceResourceRef,
  PlaceRemovalFailure as PlaceResourceFailure,
  PlaceRemoveResult,
  PlaceViolation,
  SpacePlace,
  SpaceSpec as PlaceSpaceSpec,
} from './places/registry.js';
import { requireSpacesReleased } from './release.js';

const DEFAULT_SPACE_MEMORY_BYTES = 4 * 1024 * 1024 * 1024;

export type {
  PlaceCheckResult,
  PlaceDiskCleanUpResult,
  PlaceDiskKeptItem,
  PlaceDiskUsage,
  PlaceRemoveResult,
  PlaceResourceFailure,
  PlaceResourceRef,
  PlaceSpaceEntry,
  PlaceSpaceSpec,
  PlaceViolation,
  SpacePlace,
};

export interface PlaceRegistry {
  get: (placeId: string) => SpacePlace | null;
}

export interface CreateSpaceManagerOptions {
  registry: PlaceRegistry;
  now?: (() => Date) | undefined;
  requireReleased?: (() => void) | undefined;
}

export interface CreateSpaceInput {
  placeId: string;
  projectDirectory: string;
  name: string;
  id?: string | undefined;
}

export interface CreatedSpace extends PlaceSpaceSpec {
  placeId: string;
}

export interface ListedPlaceSpace extends PlaceSpaceEntry {
  placeId: string;
}

export interface SpaceManager {
  createSpace: (input: CreateSpaceInput) => Promise<CreatedSpace>;
  listSpaces: (input: { placeId: string }) => Promise<ListedPlaceSpace[]>;
  stopSpace: (input: { placeId: string; spaceId: string }) => Promise<void>;
  startSpace: (input: { placeId: string; spaceId: string }) => Promise<void>;
  removeSpace: (input: { placeId: string; spaceId: string }) => Promise<PlaceRemoveResult>;
}

export function createSpaceManager({
  registry,
  now = () => new Date(),
  requireReleased = requireSpacesReleased,
}: CreateSpaceManagerOptions): SpaceManager {
  const requirePlace = (placeId: string): SpacePlace => {
    const place = registry.get(placeId);
    if (!place) {
      throw new SpaceError('place_not_found', `There is no place named '${placeId}'. Pick a configured place.`);
    }
    return place;
  };

  const removeSpace = async ({ placeId, spaceId }: { placeId: string; spaceId: string }): Promise<PlaceRemoveResult> => {
    const result = await requirePlace(placeId).remove(spaceId);
    if (result.failed.length > 0) {
      throw new SpaceError(
        'space_remove_incomplete',
        `Could not remove: ${result.failed.map((item) => `${item.kind} ${item.name}`).join(', ')}`,
        result,
      );
    }
    return result;
  };

  const createSpace = async ({
    placeId,
    projectDirectory,
    name,
    id = createSpaceId(),
  }: CreateSpaceInput): Promise<CreatedSpace> => {
    requireReleased();
    const place = requirePlace(placeId);
    const spec: PlaceSpaceSpec = {
      id: requireSpaceId(id),
      name: normalizeSpaceName(name),
      project: hashProjectDirectory(projectDirectory),
      created: now().toISOString(),
      memoryBytes: DEFAULT_SPACE_MEMORY_BYTES,
    };
    await place.create(spec);

    const discard = async (): Promise<PlaceRemoveResult> => {
      try {
        return await place.remove(spec.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { removed: [], failed: [{ kind: 'space', name: spec.id, message }] };
      }
    };

    let violations: PlaceViolation[];
    try {
      violations = await place.verify(spec.id);
    } catch (error) {
      const removal = await discard();
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof SpaceError ? error.code : 'space_verification_failed';
      const wrapped = new SpaceError(
        code,
        `The space was removed because it could not be verified. ${message}`,
        { removal },
      );
      wrapped.cause = error;
      throw wrapped;
    }
    if (violations.length > 0) {
      const removal = await discard();
      throw new SpaceError(
        'space_verification_failed',
        `The space was removed because it does not match the requested restrictions: ${violations.map((violation) => violation.message).join('; ')}`,
        { violations, removal },
      );
    }
    return { placeId: place.id, ...spec };
  };

  const listSpaces = async ({ placeId }: { placeId: string }): Promise<ListedPlaceSpace[]> => {
    const place = requirePlace(placeId);
    return (await place.list()).map((space) => ({ placeId: place.id, ...space }));
  };

  const stopSpace = async ({ placeId, spaceId }: { placeId: string; spaceId: string }): Promise<void> =>
    requirePlace(placeId).stop(spaceId);

  const startSpace = async ({ placeId, spaceId }: { placeId: string; spaceId: string }): Promise<void> => {
    requireReleased();
    return requirePlace(placeId).start(spaceId);
  };

  return { createSpace, listSpaces, stopSpace, startSpace, removeSpace };
}
