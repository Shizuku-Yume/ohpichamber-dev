import { SpaceError } from './errors.js';

export interface SpacesReleaseSettings {
  isolatedSpacesEnabled?: boolean | null | undefined;
}

export const ISOLATED_SPACES_RELEASED = false;

const ISOLATED_SPACES_UNRELEASED_MESSAGE = 'Isolated spaces are not released yet: a space has no agent runtime until the OMP space runtime is built. OhPiChamber creates, starts and repairs none, and gives a space no model or login grant.';

export const isSpacesReleased = (): boolean => ISOLATED_SPACES_RELEASED;

export function requireSpacesReleased(): void {
  if (!isSpacesReleased()) {
    throw new SpaceError('isolated_spaces_unreleased', ISOLATED_SPACES_UNRELEASED_MESSAGE);
  }
}

export const spacesHostEnabled = (settings?: SpacesReleaseSettings | null): boolean =>
  isSpacesReleased() && settings?.isolatedSpacesEnabled === true;
