<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
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
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
// Release notes for the update dialog.
//
// The repo publishes `changelog/index.json` on `main`: one object per release,
// newest first, with the app notes grouped as New / Improvements / Fixes /
// SDK / Misc. The website API serves the same releases and keeps the last
// good copy through a GitHub outage, so it is read first and the file on
// GitHub only when the API fails. This module renders the releases between the installed
// version (exclusive) and the offered one (inclusive) as the Markdown the
// dialog already understands: a `## [x.y.z] - YYYY-MM-DD` header per release,
// the release title in bold, the intro, then the groups.
//
// A Canary build is offered with the nights of the `canary` pre-release's
// `canary-notes.json` instead (scripts/changelog/canary-notes.mjs), rendered
// the same way: one `## [version] - date` section per night.
//
// Any failure (network, 404, unexpected shape) yields null: the update is
// still offered, only without notes.
//
// Settings > About shows the same releases as data (`fetchReleaseNotes`):
// the installed version's own notes, or the ones an offered update brings.
=======
type FeedValue = string | number | boolean | null | undefined | FeedValue[] | { [key: string]: FeedValue };
type GroupKey = 'new' | 'improvements' | 'fixes' | 'sdk' | 'misc';

export type CompareVersions<Version = string> = (a: Version, b: Version) => number;

export interface ReleaseNotes {
  version: string;
  date: string;
  title: string | null;
  intro: string | null;
  groups: { key: GroupKey; bullets: string[] }[];
}

interface ParsedRelease extends Omit<ReleaseNotes, 'groups'> {
  groups: { key: GroupKey; heading: string; bullets: string[] }[];
}

export interface FetchNotesOptions {
  fetch?: (url: string, options: { signal: AbortSignal }) => Promise<{
    ok: boolean;
    json: () => Promise<FeedValue>;
  }>;
  timeoutMs?: number;
}

const isFeedObject = (value: FeedValue): value is { [key: string]: FeedValue } => value !== null
  && typeof value === 'object' && !Array.isArray(value);
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts

<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
const CHANGELOG_API_URL = 'https://api.openchamber.dev/v1/changelog/full';
const CHANGELOG_INDEX_URL = 'https://raw.githubusercontent.com/openchamber/openchamber/main/changelog/index.json';
// canary.yml writes the nights to the R2 mirror too; GitHub is the fallback.
const CANARY_NOTES_MIRROR_URL = 'https://downloads.openchamber.dev/desktop/canary/canary-notes.json';
const CANARY_NOTES_URL = 'https://github.com/openchamber/openchamber/releases/download/canary/canary-notes.json';
const PULL_URL = 'https://github.com/openchamber/openchamber/pull/';
=======
const CHANGELOG_API_URL = 'https://api.openchamber.dev/v1/changelog/full';
const CHANGELOG_INDEX_URL = 'https://raw.githubusercontent.com/openchamber/openchamber/main/changelog/index.json';
const CANARY_NOTES_MIRROR_URL = 'https://downloads.openchamber.dev/desktop/canary/canary-notes.json';
const CANARY_NOTES_URL = 'https://github.com/openchamber/openchamber/releases/download/canary/canary-notes.json';
const PULL_URL = 'https://github.com/openchamber/openchamber/pull/';
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts

const GROUPS: [GroupKey, string][] = [
  ['new', 'New'],
  ['improvements', 'Improvements'],
  ['fixes', 'Fixes'],
  ['sdk', 'SDK'],
  ['misc', 'Misc'],
];

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
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
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
// The file crosses a network boundary with no schema library on this side, so
// each field is coerced into its domain shape here; a release without a valid
// version and date is dropped.
const text = (value) => (value === null || value === undefined ? null : String(value).trim() || null);
const bulletList = (value) => (Array.isArray(value) ? value.map((item) => String(item)) : []);
=======
const text = (value: FeedValue) => (value === null || value === undefined ? null : String(value).trim() || null);
const bulletList = (value: FeedValue) => (Array.isArray(value) ? value.map((item) => String(item)) : []);
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts

const parseRelease = (entry: FeedValue): ParsedRelease | null => {
  if (!isFeedObject(entry)) return null;
  const version = text(entry.version);
  const date = text(entry.date);
  if (!version || !VERSION_PATTERN.test(version) || !date || !DATE_PATTERN.test(date)) return null;
  const app = isFeedObject(entry.app) ? entry.app : {};
  return {
    version,
    date,
    title: text(entry.title),
    intro: text(entry.intro),
    groups: GROUPS.map(([key, heading]) => ({ key, heading, bullets: bulletList(app[key]) })),
  };
};

const renderRelease = (release: ParsedRelease) => {
  const lines = [`## [${release.version}] - ${release.date}`, ''];
  if (release.title) lines.push(`**${release.title}**`, '');
  if (release.intro) lines.push(release.intro, '');
  for (const { heading, bullets } of release.groups) {
    if (bullets.length === 0) continue;
    lines.push(`### ${heading}`, '', ...bullets.map((bullet) => `- ${bullet}`), '');
  }
  return lines.join('\n').trim();
};

<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
/** The parsed releases in (fromVersion, toVersion], newest first. */
const selectBetween = (entries, fromVersion, toVersion, compareVersions) => entries
  .map(parseRelease)
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
// Commit scopes as people write the names.
const AREA_NAMES = { ui: 'UI', sdk: 'SDK', vscode: 'VS Code', mcp: 'MCP', ssh: 'SSH', ios: 'iOS', api: 'API', cli: 'CLI', pwa: 'PWA' };

const areaName = (area) => AREA_NAMES[area] ?? `${area.charAt(0).toUpperCase()}${area.slice(1).replaceAll('-', ' ')}`;

// "**Chat:** remember thinking level per model [#5505](…)" from one commit.
const canaryBullet = (change) => {
  const body = text(change?.text);
  if (!body) return null;
  const area = text(change.area);
  const label = area ? `**${areaName(area)}:** ` : '';
  const pr = /^\d+$/.test(String(change.pr ?? '')) ? ` [#${change.pr}](${PULL_URL}${change.pr})` : '';
  return `${label}${area ? body : `${body.charAt(0).toUpperCase()}${body.slice(1)}`}${pr}`;
};

const parseCanaryNight = (entry) => {
  if (entry === null || entry === undefined) return null;
  const version = text(entry.version);
  const date = text(entry.date);
  if (!version || !CANARY_VERSION_PATTERN.test(version) || !date || !DATE_PATTERN.test(date)) return null;
  const bullets = (value) => (Array.isArray(value) ? value.map(canaryBullet).filter(Boolean) : []);
  return {
    version,
    date,
    title: null,
    intro: null,
    groups: [
      { key: 'new', heading: 'New', bullets: bullets(entry.new) },
      { key: 'fixes', heading: 'Fixes', bullets: bullets(entry.fixes) },
    ],
  };
};

/** The parsed releases in (fromVersion, toVersion], newest first. */
const selectBetween = (entries, parse, fromVersion, toVersion, compareVersions) => entries
  .map(parse)
=======
const AREA_NAMES = Object.fromEntries<string>([
  ['ui', 'UI'], ['sdk', 'SDK'], ['vscode', 'VS Code'], ['mcp', 'MCP'], ['ssh', 'SSH'],
  ['ios', 'iOS'], ['api', 'API'], ['cli', 'CLI'], ['pwa', 'PWA'],
]);

const areaName = (area: string) => AREA_NAMES[area] ?? `${area.charAt(0).toUpperCase()}${area.slice(1).replaceAll('-', ' ')}`;

const canaryBullet = (change: FeedValue) => {
  if (!isFeedObject(change)) return null;
  const body = text(change.text);
  if (!body) return null;
  const area = text(change.area);
  const label = area ? `**${areaName(area)}:** ` : '';
  const pr = /^\d+$/.test(String(change.pr ?? '')) ? ` [#${change.pr}](${PULL_URL}${change.pr})` : '';
  return `${label}${area ? body : `${body.charAt(0).toUpperCase()}${body.slice(1)}`}${pr}`;
};

const parseCanaryNight = (entry: FeedValue): ParsedRelease | null => {
  if (!isFeedObject(entry)) return null;
  const version = text(entry.version);
  const date = text(entry.date);
  if (!version || !CANARY_VERSION_PATTERN.test(version) || !date || !DATE_PATTERN.test(date)) return null;
  const bullets = (value: FeedValue) => (Array.isArray(value) ? value.map(canaryBullet).filter((bullet) => bullet !== null) : []);
  return {
    version,
    date,
    title: null,
    intro: null,
    groups: [
      { key: 'new', heading: 'New', bullets: bullets(entry.new) },
      { key: 'fixes', heading: 'Fixes', bullets: bullets(entry.fixes) },
    ],
  };
};

type ReleaseParser = (entry: FeedValue) => ParsedRelease | null;

const selectBetween = <Version>(entries: FeedValue[], parse: ReleaseParser, fromVersion: Version, toVersion: Version, compareVersions: CompareVersions<string | Version>) => entries
  .map(parse)
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts
  .filter((release) => release !== null)
  .filter((release) => compareVersions(release.version, fromVersion) > 0 && compareVersions(release.version, toVersion) <= 0)
  .sort((a, b) => compareVersions(b.version, a.version));

<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
/**
 * Markdown for the releases in (fromVersion, toVersion], newest first, or
 * null when the bundled changelog holds none of them.
 */
export function renderUpdateNotes(index, fromVersion, toVersion, compareVersions) {
  if (!Array.isArray(index)) return null;
  const relevant = selectBetween(index, fromVersion, toVersion, compareVersions);
  if (relevant.length === 0) return null;
  return relevant.map(renderRelease).join('\n\n');
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
const renderBetween = (entries, parse, fromVersion, toVersion, compareVersions) => {
  if (!Array.isArray(entries)) return null;
  const relevant = selectBetween(entries, parse, fromVersion, toVersion, compareVersions);
  if (relevant.length === 0) return null;
  return relevant.map(renderRelease).join('\n\n');
};

/**
 * Markdown for the releases in (fromVersion, toVersion], newest first, or
 * null when the index holds none of them.
 */
export function renderUpdateNotes(index, fromVersion, toVersion, compareVersions) {
  return renderBetween(index, parseRelease, fromVersion, toVersion, compareVersions);
=======
const renderBetween = <Version>(entries: FeedValue, parse: ReleaseParser, fromVersion: Version, toVersion: Version, compareVersions: CompareVersions<string | Version>) => {
  if (!Array.isArray(entries)) return null;
  const relevant = selectBetween(entries, parse, fromVersion, toVersion, compareVersions);
  if (relevant.length === 0) return null;
  return relevant.map(renderRelease).join('\n\n');
};

export function renderUpdateNotes<Version>(index: FeedValue, fromVersion: Version, toVersion: Version, compareVersions: CompareVersions<string | Version>) {
  return renderBetween(index, parseRelease, fromVersion, toVersion, compareVersions);
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts
}

<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
/** The notes between two versions, or null when the bundle has none. */
export async function fetchUpdateNotes(fromVersion, toVersion, compareVersions) {
  return renderUpdateNotes(readIndex(), fromVersion, toVersion, compareVersions);
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
/** The same for the Canary nights in (fromVersion, toVersion]. */
export function renderCanaryNotes(nights, fromVersion, toVersion, compareVersions) {
  return renderBetween(nights, parseCanaryNight, fromVersion, toVersion, compareVersions);
}

const fetchJson = async (url, options) => {
  const fetchImpl = options.fetch ?? fetch;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

// The API's feed entries in the index's shape. An entry the API took from a
// GitHub Release body has no groups and is left out.
const indexFromApiFeed = (feed) => {
  if (!Array.isArray(feed?.entries)) return null;
  const releases = feed.entries
    .filter((entry) => entry?.groups)
    .map(({ version, date, title, intro, groups }) => ({ version, date, title, intro, app: groups }));
  return releases.length > 0 ? releases : null;
};

const asArray = (value) => (Array.isArray(value) ? value : null);

/**
 * The release index, or the Canary nights for a Canary version; null on any
 * failure. The first source is ours, the website API or the R2 mirror, which
 * answers fast, so a slow answer means it is down and GitHub gets the rest of
 * the wait.
 */
const fetchEntries = async (canary, options) => {
  const first = { ...options, timeoutMs: options.timeoutMs ?? 5_000 };
  if (canary) return asArray(await fetchJson(CANARY_NOTES_MIRROR_URL, first)) ?? asArray(await fetchJson(CANARY_NOTES_URL, options));
  return indexFromApiFeed(await fetchJson(CHANGELOG_API_URL, first)) ?? asArray(await fetchJson(CHANGELOG_INDEX_URL, options));
};

/** Fetch the notes and render them for one update; null on any failure. */
export async function fetchUpdateNotes(fromVersion, toVersion, compareVersions, options = {}) {
  const canary = CANARY_VERSION_PATTERN.test(String(toVersion ?? ''));
  const entries = await fetchEntries(canary, options);
  if (!entries) return null;
  return (canary ? renderCanaryNotes : renderUpdateNotes)(entries, fromVersion, toVersion, compareVersions);
=======
export function renderCanaryNotes<Version>(nights: FeedValue, fromVersion: Version, toVersion: Version, compareVersions: CompareVersions<string | Version>) {
  return renderBetween(nights, parseCanaryNight, fromVersion, toVersion, compareVersions);
}

const fetchJson = async (url: string, options: FetchNotesOptions) => {
  const fetchImpl = options.fetch ?? fetch;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
    const value: FeedValue = response.ok ? await response.json() : null;
    return value;
  } catch {
    return null;
  }
};

const indexFromApiFeed = (feed: FeedValue) => {
  if (!isFeedObject(feed) || !Array.isArray(feed.entries)) return null;
  const releases = feed.entries
    .filter(isFeedObject)
    .filter((entry) => entry.groups)
    .map(({ version, date, title, intro, groups }) => ({ version, date, title, intro, app: groups }));
  return releases.length > 0 ? releases : null;
};

const asArray = (value: FeedValue) => (Array.isArray(value) ? value : null);

const fetchEntries = async (canary: boolean, options: FetchNotesOptions) => {
  const first = { ...options, timeoutMs: options.timeoutMs ?? 5_000 };
  if (canary) return asArray(await fetchJson(CANARY_NOTES_MIRROR_URL, first)) ?? asArray(await fetchJson(CANARY_NOTES_URL, options));
  return indexFromApiFeed(await fetchJson(CHANGELOG_API_URL, first)) ?? asArray(await fetchJson(CHANGELOG_INDEX_URL, options));
};

export async function fetchUpdateNotes<Version>(fromVersion: Version, toVersion: Version, compareVersions: CompareVersions<string | Version>, options: FetchNotesOptions = {}) {
  const canary = CANARY_VERSION_PATTERN.test(String(toVersion ?? ''));
  const entries = await fetchEntries(canary, options);
  if (!entries) return null;
  return (canary ? renderCanaryNotes : renderUpdateNotes)(entries, fromVersion, toVersion, compareVersions);
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts
}

<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
/**
 * The releases of `version` as data, newest first: those in (since, version]
 * when `since` is older, else `version` alone. An empty list means the bundle
 * has no notes for it; null means the bundle could not be read.
 */
export async function fetchReleaseNotes(version, since, compareVersions) {
  const entries = readIndex();
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
/**
 * The releases of `version` as data, newest first: those in (since, version]
 * when `since` is older, else `version` alone (the installed version, or the
 * way back from Canary to Stable). An empty list means the source has no
 * notes for it; null means the source could not be read.
 */
export async function fetchReleaseNotes(version, since, compareVersions, options = {}) {
  const canary = CANARY_VERSION_PATTERN.test(version);
  const entries = await fetchEntries(canary, options);
=======
export async function fetchReleaseNotes(version: string, since: string | undefined, compareVersions: CompareVersions, options: FetchNotesOptions = {}): Promise<ReleaseNotes[] | null> {
  const canary = CANARY_VERSION_PATTERN.test(version);
  const entries = await fetchEntries(canary, options);
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts
  if (!entries) return null;
  const releases = since && compareVersions(version, since) > 0
<<<<<<< HEAD:packages/web/server/lib/changelog/update-notes.js
    ? selectBetween(entries, since, version, compareVersions)
    : entries.map(parseRelease).filter((release) => release?.version === version);
||||||| bc50ba56aa:packages/web/server/lib/changelog/update-notes.js
    ? selectBetween(entries, parse, since, version, compareVersions)
    : entries.map(parse).filter((release) => release?.version === version);
=======
    ? selectBetween(entries, parse, since, version, compareVersions)
    : entries.map(parse).filter((release): release is ParsedRelease => release !== null && release.version === version);
>>>>>>> upstream/main:packages/web/server/lib/changelog/update-notes.ts
  return releases.map(({ version: releaseVersion, date, title, intro, groups }) => ({
    version: releaseVersion,
    date,
    title,
    intro,
    groups: groups.filter(({ bullets }) => bullets.length > 0).map(({ key, bullets }) => ({ key, bullets })),
  }));
}
