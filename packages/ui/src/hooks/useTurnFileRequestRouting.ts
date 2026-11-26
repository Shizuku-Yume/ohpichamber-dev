import React from 'react';
import type { TurnDiff } from '@openchamber/agent-contract';

import { findRepoFile, toAbsoluteFilePath } from '@/lib/path-utils';

export interface TurnFileRequestState {
    file: string;
    sessionId: string | null;
    directory: string | null;
    panelSessionId: string | null;
    turnId?: string;
}

export interface TurnFileRouteTarget {
    path: string;
    turnId?: string;
    turnSessionId: string | null;
    turnDirectory: string | null;
}

export function useTurnFileRequestRouting({
    turnFileRequest,
    visible,
    mode,
    routeType,
    navigationOwnerKey,
    ownerKey,
    pinnedTurnId,
    turnSessionId,
    turnDiffSettled,
    turnDiff,
    turnFiles,
    rootDirectory,
    turnDirectory,
    clearRequest,
    openTurnFile,
}: {
    turnFileRequest: TurnFileRequestState | null;
    visible: boolean;
    mode: string;
    routeType: string;
    navigationOwnerKey: string;
    ownerKey: string;
    pinnedTurnId: string | undefined;
    turnSessionId: string | null | undefined;
    turnDiffSettled: boolean;
    turnDiff: TurnDiff | null;
    turnFiles: readonly { path: string }[];
    rootDirectory: string;
    turnDirectory: string;
    clearRequest: () => void;
    openTurnFile: (target: TurnFileRouteTarget) => void;
}): void {
    React.useEffect(() => {
        if (!turnFileRequest || !visible) return;
        if (mode !== 'turn' || routeType !== 'list' || navigationOwnerKey !== ownerKey) return;
        const requestMatchesPin = (turnFileRequest.turnId ?? undefined) === pinnedTurnId
            && (turnFileRequest.sessionId ?? null) === (turnSessionId ?? null);
        if (!requestMatchesPin) {
            clearRequest();
            return;
        }
        if (!turnDiffSettled) return;
        const file = toAbsoluteFilePath(turnFileRequest.directory || rootDirectory, turnFileRequest.file);
        if (turnDiff?.state === 'ready') {
            const inTurn = findRepoFile(file, turnDirectory, turnFiles.map((entry) => entry.path));
            if (inTurn) {
                clearRequest();
                openTurnFile({
                    path: inTurn,
                    turnId: turnFileRequest.turnId,
                    turnSessionId: turnFileRequest.sessionId,
                    turnDirectory: turnFileRequest.directory,
                });
                return;
            }
        }
        clearRequest();
    }, [turnFileRequest, visible, mode, routeType, navigationOwnerKey, ownerKey, pinnedTurnId, turnSessionId, turnDiffSettled, turnDiff, turnFiles, rootDirectory, turnDirectory, clearRequest, openTurnFile]);
}
