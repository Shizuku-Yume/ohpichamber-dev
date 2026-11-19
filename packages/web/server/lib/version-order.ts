<<<<<<< HEAD:packages/web/server/lib/version-order.js
// Version order for release notes: semver precedence, so a pre-release build
// (2.5.4-rc.20261030.6) sorts after 2.5.3 and before 2.5.4, and pre-releases
// of one release by day and run.
||||||| bc50ba56aa:packages/web/server/lib/version-order.js
// Version order for update checks and release notes: semver precedence,
// so a Canary build (2.5.4-canary.20261030.6) sorts after 2.5.3, before
// 2.5.4, and Canary builds of one release by day and run.
=======
import type { JsonValue } from './shared/json-values.js';
>>>>>>> upstream/main:packages/web/server/lib/version-order.ts

function parseVersionForComparison(value: JsonValue | undefined) {
  const [normalized = ''] = String(value || '').replace(/^v/, '').split('+');
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

<<<<<<< HEAD:packages/web/server/lib/version-order.js
// Semver precedence of two pre-release tags: numeric identifiers compare as
// numbers and before text, so 2.5.4-rc.20261031.7 follows 2.5.4-rc.20261030.6.
function comparePrerelease(a, b) {
||||||| bc50ba56aa:packages/web/server/lib/version-order.js
// Semver precedence of two pre-release tags: numeric identifiers compare as
// numbers and before text, so 2.5.4-canary.20261031.7 follows
// 2.5.4-canary.20261030.6.
function comparePrerelease(a, b) {
=======
function comparePrerelease(a: string[], b: string[]) {
>>>>>>> upstream/main:packages/web/server/lib/version-order.ts
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a[index];
    const bPart = b[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) {
      const diff = Number(aPart) - Number(bPart);
      if (diff !== 0) return diff;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (aPart !== bPart) {
      return aPart < bPart ? -1 : 1;
    }
  }
  return 0;
}

export function compareVersions(left: JsonValue | undefined, right: JsonValue | undefined) {
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
