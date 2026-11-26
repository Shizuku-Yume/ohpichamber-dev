import React from 'react';
import { findRepoFile, toAbsoluteFilePath } from '@/lib/path-utils';
import type { TurnSnapshotDiff } from '../turnSnapshotDiff';
import type { DiffScope } from './types';

type PendingTurnDiffRequest = { file: string; sessionId: string | null; turnId?: string; panelSessionId: string | null } | null;

interface DiffViewTurnNavigationOptions {
    visible: boolean;
    activeDiffScope: DiffScope;
    setDisplayFile: React.Dispatch<React.SetStateAction<string | null>>;
    setDisplayFileStaged: React.Dispatch<React.SetStateAction<boolean>>;
    shouldPinAfterAlignRef: React.RefObject<boolean>;
    pendingScrollTargetRef: React.RefObject<string | null>;
    expandStackedFile: (path: string) => void;
    setScrollRequestNonce: React.Dispatch<React.SetStateAction<number>>;
    pendingTurnDiffFile: PendingTurnDiffRequest;
    setPendingTurnDiffFile: (request: PendingTurnDiffRequest) => void;
    diffScope: DiffScope | null;
    panelSessionId: string | null;
    turnDiffSettled: boolean;
    rootDirectory: string | undefined;
    lastTurnDiffs: TurnSnapshotDiff[] | null;
}

export function useDiffViewTurnNavigation({
    visible, activeDiffScope, setDisplayFile, setDisplayFileStaged, shouldPinAfterAlignRef,
    pendingScrollTargetRef, expandStackedFile, setScrollRequestNonce, pendingTurnDiffFile, diffScope,
    panelSessionId, setPendingTurnDiffFile, turnDiffSettled, rootDirectory, lastTurnDiffs,
}: DiffViewTurnNavigationOptions) {
    const revealListedFile = React.useCallback((path: string) => {
        setDisplayFile(path);
        setDisplayFileStaged(false);
        shouldPinAfterAlignRef.current = true;
        pendingScrollTargetRef.current = path;
        expandStackedFile(path);
        setScrollRequestNonce((value) => value + 1);
    }, [expandStackedFile, pendingScrollTargetRef, setDisplayFile, setDisplayFileStaged, setScrollRequestNonce, shouldPinAfterAlignRef]);

    React.useEffect(() => {
        if (!pendingTurnDiffFile) return;
        if (!visible) return;
        if (diffScope !== 'turn' || pendingTurnDiffFile.panelSessionId !== panelSessionId) {
            setPendingTurnDiffFile(null);
            return;
        }
        if (!turnDiffSettled || activeDiffScope !== 'turn') return;
        setPendingTurnDiffFile(null);
        if (lastTurnDiffs === null) return;
        const file = toAbsoluteFilePath(rootDirectory, pendingTurnDiffFile.file);
        const listed = findRepoFile(file, rootDirectory, lastTurnDiffs.flatMap((diff) => diff.file ?? []));
        if (listed) revealListedFile(listed);
    }, [activeDiffScope, diffScope, lastTurnDiffs, panelSessionId, pendingTurnDiffFile, revealListedFile, rootDirectory, setPendingTurnDiffFile, turnDiffSettled, visible]);
}
