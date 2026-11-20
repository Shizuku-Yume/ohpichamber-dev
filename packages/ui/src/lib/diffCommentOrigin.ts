
import { z } from 'zod';
import { readSourceControlProvider } from '@/lib/source-control/providers/registry';
import type { SourceControlProvider } from '@/lib/source-control/types';
import type { WalkthroughSource, WalkthroughTarget } from '@/lib/walkthrough/types';

const sourceControlProviderIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

export const diffCommentOriginSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('commit'), hash: z.string().min(1) }),
    z.object({ kind: z.literal('branch'), baseRef: z.string().min(1), headRef: z.string().min(1) }),
    z.object({
        kind: z.literal('change-request'),
        provider: sourceControlProviderIdSchema.optional(),
        number: z.number().int().positive(),
        repository: z.string().min(1).optional(),
        revision: z.string().min(1).optional(),
    }),
]);

export type DiffCommentOrigin = z.infer<typeof diffCommentOriginSchema>;

const shortHash = (hash: string) => hash.slice(0, 10);

export function diffCommentOriginFromSource(
    source: WalkthroughSource | { kind: 'working-tree' } | { kind: 'commit'; hash: string } | { kind: 'branch'; baseRef: string; headRef: string } | { kind: 'pr'; number: number; sourceRepo?: { owner: string; repo: string } | null; revision?: string } | null | undefined,
    changeRequest?: { provider?: SourceControlProvider | null; revision?: string | null },
): DiffCommentOrigin | undefined {
    if (!source) return undefined;
    switch (source.kind) {
        case 'working-tree':
            return undefined;
        case 'commit':
            return { kind: 'commit', hash: source.hash };
        case 'branch':
            return { kind: 'branch', baseRef: source.baseRef, headRef: source.headRef };
        case 'pr': {
            const repo = source.sourceRepo ? `${source.sourceRepo.owner}/${source.sourceRepo.repo}` : undefined;
            return {
                kind: 'change-request',
                provider: changeRequest?.provider ?? undefined,
                number: source.number,
                repository: repo,
                revision: source.revision ?? changeRequest?.revision ?? undefined,
            };
        }
    }
}

/** The origin of a walkthrough target, when it compares something other than uncommitted changes. */
export const diffCommentOriginFromWalkthroughTarget = (
    target: WalkthroughTarget | null | undefined,
    changeRequest?: { provider?: SourceControlProvider | null; revision?: string | null },
): DiffCommentOrigin | undefined => (
    target
        ? diffCommentOriginFromSource(
            target.source,
            'context' in target ? { provider: target.context.provider } : changeRequest,
        )
        : undefined
);

/** Identity for matching drafts to the surface they were written on. */
export function diffCommentOriginKey(origin: DiffCommentOrigin | undefined): string {
    if (!origin) return '';
    switch (origin.kind) {
        case 'commit':
            return `commit:${origin.hash}`;
        case 'branch':
            return `branch:${origin.baseRef}...${origin.headRef}`;
        case 'change-request':
            return `cr:${origin.provider ?? ''}:${origin.repository ?? ''}:${origin.number}`;
    }
}

const changeRequestReference = (origin: Extract<DiffCommentOrigin, { kind: 'change-request' }>) => (
    origin.provider === 'gitlab' ? `!${origin.number}` : `#${origin.number}`
);

function diffCommentOriginLabel(origin: DiffCommentOrigin): string {
    switch (origin.kind) {
        case 'commit':
            return shortHash(origin.hash);
        case 'branch':
            return origin.headRef;
        case 'change-request':
            return changeRequestReference(origin);
    }
}

export function describeDiffCommentOrigin(origin: DiffCommentOrigin): string {
    switch (origin.kind) {
        case 'commit':
            return `in commit ${shortHash(origin.hash)}`;
        case 'branch':
            return `in the changes of branch \`${origin.headRef}\` compared with \`${origin.baseRef}\``;
        case 'change-request': {
            const descriptor = origin.provider ? readSourceControlProvider(origin.provider) : null;
            const noun = descriptor ? `${descriptor.label} ${descriptor.terminology.promptNoun}` : 'pull request';
            const repository = origin.repository ? ` in ${origin.repository}` : '';
            const revision = origin.revision ? ` at commit ${shortHash(origin.revision)}` : '';
            return `in ${noun} ${changeRequestReference(origin)}${repository}${revision}`;
        }
    }
}

/** A file name as chips show it, with the diff it came from when not on disk: `app.ts (#5543)`. */
export function fileWithDiffCommentOrigin(file: string, origin: DiffCommentOrigin | undefined): string {
    return origin ? `${file} (${diffCommentOriginLabel(origin)})` : file;
}
