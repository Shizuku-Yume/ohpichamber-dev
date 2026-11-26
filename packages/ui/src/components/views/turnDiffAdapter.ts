import type { TurnDiff, TurnDiffFile } from '@openchamber/agent-contract';

import type { DiffData } from './diffView/types';
import { createTextDiffDataFromPatch } from './diffView/diffData';
import type { TurnSnapshotDiff } from './turnSnapshotDiff';

export interface AdaptedTurnDiffFiles {
    snapshots: TurnSnapshotDiff[];
    diffDataByPath: Map<string, DiffData>;
    hasIncompleteRows: boolean;
}

const EMPTY_ADAPTED: AdaptedTurnDiffFiles = {
    snapshots: [],
    diffDataByPath: new Map(),
    hasIncompleteRows: false,
};

const diffDataForFile = (file: TurnDiffFile): DiffData => {
    if (file.patch) {
        return createTextDiffDataFromPatch(file.path, file.patch, 'patch');
    }
    return {
        original: file.before ?? '',
        modified: file.after ?? '',
        contextMode: 'full',
    };
};

export function adaptTurnDiffFiles(files: readonly TurnDiffFile[]): AdaptedTurnDiffFiles {
    const rows = files.map((file) => ({
        snapshot: {
            file: file.path,
            status: file.status,
            before: file.before ?? undefined,
            after: file.after ?? undefined,
            patch: file.patch || undefined,
            additions: file.additions,
            deletions: file.deletions,
            previousPath: file.previousPath,
        } satisfies TurnSnapshotDiff,
        diffData: diffDataForFile(file),
        partial: file.incomplete || file.truncated,
    }));
    rows.sort((a, b) => (a.snapshot.file ?? '').localeCompare(b.snapshot.file ?? ''));
    const snapshots: TurnSnapshotDiff[] = [];
    const diffDataByPath = new Map<string, DiffData>();
    let hasIncompleteRows = false;
    for (const row of rows) {
        snapshots.push(row.snapshot);
        if (row.snapshot.file) {
            diffDataByPath.set(row.snapshot.file, row.diffData);
        }
        if (row.partial) hasIncompleteRows = true;
    }
    return { snapshots, diffDataByPath, hasIncompleteRows };
}

export function adaptTurnDiff(diff: TurnDiff | null | undefined): AdaptedTurnDiffFiles {
    if (!diff || diff.state !== 'ready') {
        return EMPTY_ADAPTED;
    }
    return adaptTurnDiffFiles(diff.files);
}
