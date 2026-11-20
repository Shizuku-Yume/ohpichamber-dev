// Release notes, read from the changelog bundled with the app.
//
// `changelog/index.json` is generated from `changelog/*.md` and ships with the
// package (`resources/changelog/index.json`); nothing is fetched. Each release
// carries the app notes grouped as New / Improvements / Fixes / SDK / Misc.
// The update dialog takes the releases between the installed version
// (exclusive) and the offered one (inclusive) as Markdown: a
// `## [x.y.z] - YYYY-MM-DD` header per release, the release title in bold, the
// intro, then the groups.
//
// Settings > About shows the same releases as data (`fetchReleaseNotes`):
// the installed version's own notes, or the ones an offered update brings.
//
// A missing or unreadable bundle yields null: the update is still offered and
// About simply shows no notes.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GROUPS = [
  ['new', 'New'],
  ['improvements', 'Improvements'],
  ['fixes', 'Fixes'],
  ['sdk', 'SDK'],
  ['misc', 'Misc'],
];

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The packaged copy beside the server, then the checkout this module runs in.
// Both are static files owned by the build.
const INDEX_CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', 'resources', 'changelog', 'index.json'),
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'changelog', 'index.json'),
];

let cachedIndex;

/** The bundled release entries, or null when none can be read. */
const readIndex = () => {
  if (cachedIndex !== undefined) return cachedIndex;
  for (const candidate of INDEX_CANDIDATES) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (Array.isArray(parsed)) {
        cachedIndex = parsed;
        return cachedIndex;
      }
    } catch {
    }
  }
  cachedIndex = null;
  return cachedIndex;
};

const text = (value) => (value === null || value === undefined ? null : String(value).trim() || null);
const bulletList = (value) => (Array.isArray(value) ? value.map((item) => String(item)) : []);

const parseRelease = (entry) => {
  if (entry === null || entry === undefined) return null;
  const version = text(entry.version);
  const date = text(entry.date);
  if (!version || !VERSION_PATTERN.test(version) || !date || !DATE_PATTERN.test(date)) return null;
  const app = entry.app ?? {};
  return {
    version,
    date,
    title: text(entry.title),
    intro: text(entry.intro),
    groups: GROUPS.map(([key, heading]) => ({ key, heading, bullets: bulletList(app[key]) })),
  };
};

const renderRelease = (release) => {
  const lines = [`## [${release.version}] - ${release.date}`, ''];
  if (release.title) lines.push(`**${release.title}**`, '');
  if (release.intro) lines.push(release.intro, '');
  for (const { heading, bullets } of release.groups) {
    if (bullets.length === 0) continue;
    lines.push(`### ${heading}`, '', ...bullets.map((bullet) => `- ${bullet}`), '');
  }
  return lines.join('\n').trim();
};

/** The parsed releases in (fromVersion, toVersion], newest first. */
const selectBetween = (entries, fromVersion, toVersion, compareVersions) => entries
  .map(parseRelease)
  .filter((release) => release !== null)
  .filter((release) => compareVersions(release.version, fromVersion) > 0 && compareVersions(release.version, toVersion) <= 0)
  .sort((a, b) => compareVersions(b.version, a.version));

/**
 * Markdown for the releases in (fromVersion, toVersion], newest first, or
 * null when the bundled changelog holds none of them.
 */
export function renderUpdateNotes(index, fromVersion, toVersion, compareVersions) {
  if (!Array.isArray(index)) return null;
  const relevant = selectBetween(index, fromVersion, toVersion, compareVersions);
  if (relevant.length === 0) return null;
  return relevant.map(renderRelease).join('\n\n');
}

/** The notes between two versions, or null when the bundle has none. */
export async function fetchUpdateNotes(fromVersion, toVersion, compareVersions) {
  return renderUpdateNotes(readIndex(), fromVersion, toVersion, compareVersions);
}

/**
 * The releases of `version` as data, newest first: those in (since, version]
 * when `since` is older, else `version` alone. An empty list means the bundle
 * has no notes for it; null means the bundle could not be read.
 */
export async function fetchReleaseNotes(version, since, compareVersions) {
  const entries = readIndex();
  if (!entries) return null;
  const releases = since && compareVersions(version, since) > 0
    ? selectBetween(entries, since, version, compareVersions)
    : entries.map(parseRelease).filter((release) => release?.version === version);
  return releases.map(({ version: releaseVersion, date, title, intro, groups }) => ({
    version: releaseVersion,
    date,
    title,
    intro,
    groups: groups.filter(({ bullets }) => bullets.length > 0).map(({ key, bullets }) => ({ key, bullets })),
  }));
}
