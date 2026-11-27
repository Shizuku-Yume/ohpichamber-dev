import { isString } from '../shared/guards.js';

const TOOLCHAIN_SEGMENTS = [
  '/opt/homebrew/',
  '/opt/pkg/',
  '/opt/pmk/',
  '/snap/',
];

const TOOLCHAIN_BASENAMES = new Set([
  '.cargo',
  '.bun',
  '.nvm',
  '.pyenv',
  '.rbenv',
  '.sdkman',
  '.asdf',
  '.volta',
  '.fnm',
  '.local',
  '.opencode',
  'node_modules',
]);

export function pathLooksUserConfigured(
  value: string | null | undefined,
  home: string | null | undefined,
  delim: string,
): boolean {
  if (!isString(value) || !value) {
    return false;
  }

  const segments = value.split(delim);
  const normalizedHome = isString(home) ? home.replaceAll('\\', '/') : '';
  const homeWithSep = normalizedHome ? `${normalizedHome}/` : '';

  return segments.some((segment) => {
    if (!segment) return false;
    const normalizedSegment = segment.replaceAll('\\', '/');

    if (normalizedHome && (normalizedSegment === normalizedHome || normalizedSegment.startsWith(homeWithSep))) {
      return true;
    }

    if (TOOLCHAIN_SEGMENTS.some((prefix) => normalizedSegment.startsWith(prefix))) {
      return true;
    }

    const parts = normalizedSegment.split('/').filter(Boolean);
    if (parts.some((part) => TOOLCHAIN_BASENAMES.has(part))) {
      return true;
    }

    return false;
  });
}

export function mergePathValues(
  primary: string | null | undefined,
  fallback: string | null | undefined,
  delim: string,
): string {
  const seen = new Set<string>();
  const result: string[] = [];

  const addSegments = (value: string | null | undefined): void => {
    if (!isString(value) || !value) return;
    const segments = value.split(delim);
    for (const segment of segments) {
      if (segment && !seen.has(segment)) {
        seen.add(segment);
        result.push(segment);
      }
    }
  };

  addSegments(primary);
  addSegments(fallback);

  return result.join(delim);
}
