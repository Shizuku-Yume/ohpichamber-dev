import type { JsonValue } from './shared/json-values.js';

interface ParsedVersion {
  parts: number[];
  prerelease: string[] | null;
}

function parseVersionForComparison(value: JsonValue | undefined): ParsedVersion {
  const normalized = String(value || '').replace(/^v/, '').split('+')[0] ?? '';
  const prereleaseIndex = normalized.indexOf('-');
  const core = prereleaseIndex >= 0 ? normalized.slice(0, prereleaseIndex) : normalized;
  const parts = core.split('.').map((part) => {
    const parsed = Number.parseInt(part || '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  return {
    parts,
    prerelease: prereleaseIndex >= 0 ? normalized.slice(prereleaseIndex + 1).split('.') : null,
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a[index];
    const rightPart = b[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const aNumeric = /^\d+$/.test(leftPart);
    const bNumeric = /^\d+$/.test(rightPart);
    if (aNumeric && bNumeric) {
      const diff = Number(leftPart) - Number(rightPart);
      if (diff !== 0) return diff;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return 0;
}

export function compareVersions(left: JsonValue | undefined, right: JsonValue | undefined): number {
  const a = parseVersionForComparison(left);
  const b = parseVersionForComparison(right);
  const length = Math.max(a.parts.length, b.parts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (a.parts[index] || 0) - (b.parts[index] || 0);
    if (diff !== 0) return diff;
  }

  if (!a.prerelease || !b.prerelease) {
    if (a.prerelease) return -1;
    return b.prerelease ? 1 : 0;
  }

  return comparePrerelease(a.prerelease, b.prerelease);
}

