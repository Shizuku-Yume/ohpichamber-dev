import { z } from 'zod';
import type { JsonValue } from '../shared/json-values.js';

const LINKED_ISSUE_KINDS = ['issue', 'pull', 'linear', 'tracker', 'guest', 'external'] as const;

const trackerEntrySchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('tracker'),
  provider: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  identifier: z.string().min(1).refine((value) => value.trim() === value),
  title: z.string().min(1),
  url: z.string().min(1),
  linkedAt: z.number().int().nonnegative(),
  author: z.string().optional(),
  authorAvatarUrl: z.string().optional(),
}).refine((entry) => entry.id === `${entry.provider}:${entry.identifier}`, {
  path: ['id'],
  message: 'tracker id must match provider and identifier',
});

const linkedEntrySchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  kind: z.enum(LINKED_ISSUE_KINDS),
  provider: z.string().optional(),
  number: z.number().optional(),
}).superRefine((entry, ctx) => {
  if (entry.kind !== 'tracker') return;
  const tracker = trackerEntrySchema.safeParse(entry);
  if (!tracker.success) {
    for (const issue of tracker.error.issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  }
});

export type LinkedIssueEntry = z.infer<typeof linkedEntrySchema>;

export type LinkedIssueIdentity = {
  id: string;
  url?: string | undefined;
  kind?: string | undefined;
  number?: number | undefined;
};

export type LinkedIssuesPatch = {
  openchamber: {
    linked_issues: JsonValue[];
  };
};

const linkOperationSchema = z.object({
  entries: z.array(linkedEntrySchema),
  linked: z.boolean(),
});

export type ParseLinkOperationResult =
  | { ok: true; entries: LinkedIssueEntry[]; linked: boolean; error?: never }
  | { ok: false; error: string; entries?: never; linked?: never };

export const parseLinkOperation = (payload: JsonValue | undefined): ParseLinkOperationResult => {
  const parsed = linkOperationSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    return { ok: false, error: `invalid link operation${where}: ${issue?.message ?? 'expected entries and linked'}` };
  }
  return {
    ok: true,
    entries: parsed.data.entries.map((entry) => (
      entry.kind === 'tracker' && entry.provider === 'linear' ? { ...entry, kind: 'linear' as const } : entry
    )),
    linked: parsed.data.linked,
  };
};

const normalizedThreadUrl = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase();

const linkedIssuesSchema = z.looseObject({
  openchamber: z.looseObject({ linked_issues: z.array(z.json()).catch([]) }).catch({ linked_issues: [] }),
}).catch({ openchamber: { linked_issues: [] } });

const storedEntrySchema = z.looseObject({
  id: z.string(),
  url: z.string(),
  kind: z.string(),
  number: z.number().optional(),
});

const isSameLinkedEntry = (stored: JsonValue, incoming: LinkedIssueIdentity): boolean => {
  const parsed = storedEntrySchema.safeParse(stored);
  if (!parsed.success) return false;
  const item = parsed.data;
  if (item.id === incoming.id) return true;
  return (item.kind === 'issue' || item.kind === 'pull')
    && item.kind === incoming.kind
    && item.number !== undefined
    && incoming.number !== undefined
    && Number.isFinite(item.number) && Number.isFinite(incoming.number)
    && item.number === incoming.number
    && incoming.url !== undefined
    && normalizedThreadUrl(item.url) === normalizedThreadUrl(incoming.url);
};

export const buildLinkedIssuesPatch = (
  metadata: JsonValue | undefined,
  entries: readonly LinkedIssueIdentity[],
  linked: boolean,
): LinkedIssuesPatch | null => {
  const current: JsonValue[] = linkedIssuesSchema.parse(metadata ?? {}).openchamber.linked_issues;

  let next: JsonValue[] = current;
  for (const entry of entries) {
    next = next.filter((item) => !isSameLinkedEntry(item, entry));
    if (linked) next = [...next, entry];
  }
  if (next === current || JSON.stringify(next) === JSON.stringify(current)) return null;
  return { openchamber: { linked_issues: next } };
};
