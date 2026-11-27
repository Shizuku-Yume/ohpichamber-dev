import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { isRecord } from '../shared/guards.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ReleaseGroupKey = 'new' | 'improvements' | 'fixes' | 'sdk' | 'misc';

export interface ReleaseNoteGroup {
  key: ReleaseGroupKey;
  bullets: string[];
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string | null;
  intro: string | null;
  groups: ReleaseNoteGroup[];
}

interface RenderedGroup {
  key: ReleaseGroupKey;
  heading: string;
  bullets: string[];
}

interface ParsedRelease {
  version: string;
  date: string;
  title: string | null;
  intro: string | null;
  groups: RenderedGroup[];
}

export type VersionComparator = (left: string, right: string) => number;

const GROUPS: ReadonlyArray<readonly [ReleaseGroupKey, string]> = [
  ['new', 'New'],
  ['improvements', 'Improvements'],
  ['fixes', 'Fixes'],
  ['sdk', 'SDK'],
  ['misc', 'Misc'],
];

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const INDEX_CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', 'resources', 'changelog', 'index.json'),
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'changelog', 'index.json'),
];

const changelogIndexSchema = z.array(z.json());

let cachedIndex: JsonValue[] | null | undefined;

const readIndex = (): JsonValue[] | null => {
  if (cachedIndex !== undefined) return cachedIndex;
  for (const candidate of INDEX_CANDIDATES) {
    try {
      const parsed = changelogIndexSchema.safeParse(JSON.parse(fs.readFileSync(candidate, 'utf8')));
      if (parsed.success) {
        cachedIndex = parsed.data;
        return cachedIndex;
      }
    } catch {
      continue;
    }
  }
  cachedIndex = null;
  return cachedIndex;
};

const isJsonObject = (value: JsonValue | undefined): value is JsonObject => isRecord(value);
const text = (value: JsonValue | undefined): string | null => (value === null || value === undefined ? null : String(value).trim() || null);
const bulletList = (value: JsonValue | undefined): string[] => (Array.isArray(value) ? value.map((item) => String(item)) : []);

const parseRelease = (entry: JsonValue | undefined): ParsedRelease | null => {
  if (!isJsonObject(entry)) return null;
  const version = text(entry.version);
  const date = text(entry.date);
  if (!version || !VERSION_PATTERN.test(version) || !date || !DATE_PATTERN.test(date)) return null;
  const app = isJsonObject(entry.app) ? entry.app : null;
  return {
    version,
    date,
    title: text(entry.title),
    intro: text(entry.intro),
    groups: GROUPS.map(([key, heading]) => ({ key, heading, bullets: bulletList(app?.[key]) })),
  };
};

const renderRelease = (release: ParsedRelease): string => {
  const lines = [`## [${release.version}] - ${release.date}`, ''];
  if (release.title) lines.push(`**${release.title}**`, '');
  if (release.intro) lines.push(release.intro, '');
  for (const { heading, bullets } of release.groups) {
    if (bullets.length === 0) continue;
    lines.push(`### ${heading}`, '', ...bullets.map((bullet) => `- ${bullet}`), '');
  }
  return lines.join('\n').trim();
};

const selectBetween = (entries: JsonValue[], fromVersion: string, toVersion: string, compareVersions: VersionComparator): ParsedRelease[] => entries
  .map(parseRelease)
  .filter((release): release is ParsedRelease => release !== null)
  .filter((release) => compareVersions(release.version, fromVersion) > 0 && compareVersions(release.version, toVersion) <= 0)
  .sort((a, b) => compareVersions(b.version, a.version));
export function renderUpdateNotes(index: JsonValue | undefined, fromVersion: string, toVersion: string, compareVersions: VersionComparator): string | null {
  if (!Array.isArray(index)) return null;
  const relevant = selectBetween(index, fromVersion, toVersion, compareVersions);
  if (relevant.length === 0) return null;
  return relevant.map(renderRelease).join('\n\n');
}

export async function fetchUpdateNotes(fromVersion: string, toVersion: string, compareVersions: VersionComparator): Promise<string | null> {
  return renderUpdateNotes(readIndex(), fromVersion, toVersion, compareVersions);
}

export async function fetchReleaseNotes(version: string, since: string | undefined, compareVersions: VersionComparator): Promise<ReleaseNote[] | null> {
  const entries = readIndex();
  if (!entries) return null;
  const releases = since && compareVersions(version, since) > 0
    ? selectBetween(entries, since, version, compareVersions)
    : entries.map(parseRelease).filter((release): release is ParsedRelease => release?.version === version);
  return releases.map(({ version: releaseVersion, date, title, intro, groups }) => ({
    version: releaseVersion,
    date,
    title,
    intro,
    groups: groups.filter(({ bullets }) => bullets.length > 0).map(({ key, bullets }) => ({ key, bullets })),
  }));
}
