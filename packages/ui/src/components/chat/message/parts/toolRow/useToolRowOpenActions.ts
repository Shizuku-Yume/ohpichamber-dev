import React from 'react';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { useUIStore } from '@/stores/useUIStore';
import { getDirectoryForFilePath, toAbsoluteFilePath } from '@/lib/path-utils';
import { hasTextSelectionInside } from '@/lib/textSelection';
import { isSubagentTool, isVibeSubagentTool } from '@/lib/toolHelpers';
import { resolveToolQuickOpenTarget } from '../toolDiffUtils';

export const useToolRowOpenActions = ({
    part,
    call,
    toolName,
    currentDirectory,
    onToggle,
}: {
    part: ToolCallPart | ToolResultPart;
    call: ToolCallPart | undefined;
    toolName: string;
    currentDirectory: string;
    onToggle: () => void;
}) => {
    const runtime = React.useContext(RuntimeAPIContext);
    const mobileActions = useMobileAppActions();

    const quickOpenTarget = React.useMemo<{
        absolutePath: string;
        line?: number;
    } | null>(() => {
        if (isSubagentTool(toolName) || isVibeSubagentTool(toolName)) return null;
        const target = resolveToolQuickOpenTarget(part, call);
        if (!target) return null;
        return {
            absolutePath: toAbsoluteFilePath(currentDirectory, target.filePath),
            line: target.line,
        };
    }, [call, currentDirectory, part, toolName]);

    const openQuickTarget = React.useCallback(() => {
        if (!quickOpenTarget) return;
        const { absolutePath, line } = quickOpenTarget;
        if (runtime?.editor) {
            void runtime.editor.openFile(absolutePath, line);
            return;
        }
        const contextDirectory = currentDirectory || getDirectoryForFilePath(currentDirectory, absolutePath);
        const uiStore = useUIStore.getState();
        if (line !== undefined && Number.isFinite(line)) {
            uiStore.openContextFileAtLine(contextDirectory, absolutePath, Math.max(1, Math.trunc(line)), 1);
        } else {
            uiStore.openContextFile(contextDirectory, absolutePath);
        }
        mobileActions?.openFiles();
    }, [currentDirectory, mobileActions, quickOpenTarget, runtime]);

    const handleMainClick = () => {
        if (isSubagentTool(toolName) || isVibeSubagentTool(toolName) || !runtime?.editor || !quickOpenTarget) {
            onToggle();
            return;
        }
        openQuickTarget();
    };

    const handleMainRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (hasTextSelectionInside(event.currentTarget)) return;
        handleMainClick();
    };

    const handleMainKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleMainClick();
    };

    const handleQuickOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        openQuickTarget();
    };

    return {
        quickOpenTarget,
        handleMainRowClick,
        handleMainKeyDown,
        handleQuickOpen,
    };
};
