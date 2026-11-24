// How the UI addresses an isolated space: one pure function from a directory to the route
// prefix, applied at call time wherever a request names its directory. Nothing is cached, so
// the runtime-switch rule holds: the base URL is still resolved by the resolver on every call.
//
// A space's code lives at `/spaces/<id>/<folder>` on both sides, and the server reserves that
// shape: with the feature on, an unprefixed request that names such a directory is refused. So
// the directory alone says where a request goes, and the dispatcher never guesses. See
// .workflow/isolated-spaces/DESIGN.md, "Dispatcher, sessions, events".
const SPACE_DIRECTORY = /^\/spaces\/([0-9a-f]{12})(?:\/|$)/;
const API_PREFIX = '/api/';
const SPACE_ROUTE_PREFIX = '/api/spaces/';

/** The space that owns a directory, or null for a host directory. */
export const spaceIdOfDirectory = (directory: string | null | undefined): string | null => {
  if (!directory) return null;
  const match = SPACE_DIRECTORY.exec(directory);
  return match ? match[1] : null;
};

/** Whether a directory lies inside an isolated space. */
export const isSpaceDirectory = (directory: string | null | undefined): boolean => spaceIdOfDirectory(directory) !== null;

/** Whether a route path is already addressed to a space. */
const isSpaceRoutePath = (path: string): boolean => path.startsWith(SPACE_ROUTE_PREFIX);

/**
 * `/api/<rest>` addressed to the space that owns `directory`: `/api/spaces/<id>/<rest>`. A host
 * directory, a path outside `/api/`, and a path already addressed to a space come back as they are.
 */
export const spaceApiPath = (path: string, directory: string | null | undefined): string => {
  const spaceId = spaceIdOfDirectory(directory);
  if (spaceId === null) return path;
  if (!path.startsWith(API_PREFIX) || isSpaceRoutePath(path)) return path;
  return `${SPACE_ROUTE_PREFIX}${spaceId}/${path.slice(API_PREFIX.length)}`;
};

/**
 * The headers that send a request to the space owning `directory`: its directory header,
 * URI-encoded and marked so, which every reader on the server decodes the same way. Null for a
 * host directory.
 */
export const spaceDirectoryHeaders = (directory: string | null | undefined): Record<string, string> | null => {
  if (!directory || !isSpaceDirectory(directory)) return null;
  return { 'x-openchamber-directory': encodeURIComponent(directory), 'x-openchamber-directory-encoding': 'uri' };
};

/** The root of a space, `/spaces/<id>`: the directory a socket of that space names. */
export const spaceRootDirectory = (spaceId: string): string => `/spaces/${spaceId}`;
