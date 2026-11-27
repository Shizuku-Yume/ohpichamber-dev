import React from 'react';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import type { TurnChangedFile } from '../../lib/turns/types';
import { cn } from '@/lib/utils';
import { useChatSessionSelection } from '../../chatColumnSession';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { Icon } from '@/components/icon/Icon';
import { HoverTooltip } from '@/components/ui/row-tooltip';
import { useI18n } from '@/lib/i18n';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { hasTextSelectionInside } from '@/lib/textSelection';
import { DiffCount } from '@/components/ui/diff-count';
import { toAbsoluteFilePath } from '@/lib/path-utils';
import { runNextTask } from '@/lib/timing/runNextTask';

const getDisplayFileName = (file: string): string => {
    const normalized = file.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments.at(-1) ?? file;
};

const CHANGED_FILE_CHIP_CLASS_NAME = 'inline-flex max-w-full items-center gap-1.5 rounded-lg oc-tile px-2 py-1 text-xs text-muted-foreground';
const CHANGED_FILE_CHIP_HOVER_CLASS_NAME = 'oc-tile-hover';
const CHANGED_FILE_CHIP_STYLE = { lineHeight: 'round(1.35em, 1px)' };
const CHANGED_FILE_CHIP_BUTTON_CLASS_NAME = 'inline-flex h-8 max-w-full cursor-pointer items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]';

const TurnChangedFileChipContent = React.memo(({ file, interactive = false }: { file: TurnChangedFile; interactive?: boolean }) => (
    <span
        className={cn(CHANGED_FILE_CHIP_CLASS_NAME, interactive && CHANGED_FILE_CHIP_HOVER_CLASS_NAME)}
        style={CHANGED_FILE_CHIP_STYLE}
    >
        <FileTypeIcon filePath={file.file} className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="max-w-52 truncate text-foreground/80" title={file.file}>{getDisplayFileName(file.file)}</span>
        {file.additions !== undefined && file.deletions !== undefined ? (
            <DiffCount added={file.additions} removed={file.deletions} className="typography-meta" />
        ) : null}
    </span>
));

const TurnChangedFilePillButton = React.memo(({
    file,
    onOpen,
}: {
    file: TurnChangedFile;
    onOpen: (file: string) => void;
}) => {
    const { t } = useI18n();
    const label = t('chat.changedFiles.actions.openFileTitle', { path: file.file });
    return (
        <button
            type="button"
            className={CHANGED_FILE_CHIP_BUTTON_CLASS_NAME}
            aria-label={label}
            title={label}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (hasTextSelectionInside(event.currentTarget)) return;
                onOpen(file.file);
            }}
        >
            <TurnChangedFileChipContent file={file} interactive />
        </button>
    );
});

const StaticTurnChangedFilePills = React.memo(({ files }: { files: TurnChangedFile[] }) => (
    <>
        {files.map((file) => (
            <span key={file.file} className="inline-flex h-8 max-w-full items-center" title={file.file}>
                <TurnChangedFileChipContent file={file} />
            </span>
        ))}
    </>
));

const InteractiveTurnChangedFilePills = React.memo(({ files, turnId }: { files: TurnChangedFile[]; turnId?: string }) => {
    const effectiveDirectory = useEffectiveDirectory();
    const mobileActions = useMobileAppActions();
    const openContextFile = useUIStore((state) => state.openContextFile);
    const openContextDiff = useUIStore((state) => state.openContextDiff);
    const navigateToDiff = useUIStore((state) => state.navigateToDiff);
    const setPendingTurnDiffFile = useUIStore((state) => state.setPendingTurnDiffFile);
    const isMobileLayout = useUIStore((state) => state.isMobile);
    const { sessionId } = useChatSessionSelection();

    const openFilePreview = React.useCallback((file: string) => {
        if (!effectiveDirectory) return;
        openContextFile(effectiveDirectory, toAbsoluteFilePath(effectiveDirectory, file));
        mobileActions?.openFiles();
    }, [effectiveDirectory, mobileActions, openContextFile]);

    const openTurnDiff = React.useCallback((file: string) => {
        if (!effectiveDirectory) return;
        if (!turnId) {
            openFilePreview(file);
            return;
        }
        if (mobileActions) {
            mobileActions.openChanges({ diffPath: file, scope: 'turn', turnId, sessionId, directory: effectiveDirectory });
            return;
        }
        setPendingTurnDiffFile({ file, sessionId, turnId, panelSessionId: useSessionUIStore.getState().currentSessionId });
        if (!isMobileLayout) {
            openContextDiff(effectiveDirectory, file, false, 'turn');
            return;
        }
        navigateToDiff(file, false, 'turn');
    }, [effectiveDirectory, isMobileLayout, mobileActions, navigateToDiff, openContextDiff, openFilePreview, sessionId, setPendingTurnDiffFile, turnId]);

    if (!effectiveDirectory) return <StaticTurnChangedFilePills files={files} />;

    return (
        <>
            {files.map((file) => (
                <TurnChangedFilePillButton key={file.file} file={file} onOpen={openTurnDiff} />
            ))}
        </>
    );
});

const CHANGED_FILE_CHIP_LIMIT = 4;

export const TurnChangedFilePills = React.memo(({
    files,
    turnId,
    isLatestTurn,
    isInteractive,
}: {
    files?: TurnChangedFile[];
    turnId?: string;
    isLatestTurn?: boolean;
    isInteractive?: boolean;
}) => {
    const { t } = useI18n();
    const [expanded, setExpanded] = React.useState(false);
    const toggleRef = React.useRef<HTMLButtonElement>(null);
    if (!files || files.length === 0) return null;

    const interactive = isInteractive ?? (isLatestTurn === true || Boolean(turnId));
    const hiddenCount = files.length - CHANGED_FILE_CHIP_LIMIT;
    const renderFiles = (visibleFiles: TurnChangedFile[]) => interactive
        ? <InteractiveTurnChangedFilePills files={visibleFiles} turnId={turnId} />
        : <StaticTurnChangedFilePills files={visibleFiles} />;
    if (hiddenCount <= 0) return renderFiles(files);

    const label = expanded
        ? t('chat.changedFiles.actions.showFewer')
        : t('chat.changedFiles.actions.otherFiles', { count: hiddenCount });
    return (
        <>
            {renderFiles(expanded ? files : files.slice(0, CHANGED_FILE_CHIP_LIMIT))}
            <HoverTooltip label={label}>
                <button
                    ref={toggleRef}
                    type="button"
                    className={CHANGED_FILE_CHIP_BUTTON_CLASS_NAME}
                    aria-expanded={expanded}
                    aria-label={label}
                    onClick={(event) => {
                        event.stopPropagation();
                        const collapsing = expanded;
                        setExpanded((value) => !value);
                        if (collapsing) {
                            const button = toggleRef.current;
                            runNextTask(() => {
                                if (button && button.isConnected && button.ownerDocument.activeElement === button) {
                                    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                                }
                            });
                        }
                    }}
                >
                    <span className={cn(CHANGED_FILE_CHIP_CLASS_NAME, CHANGED_FILE_CHIP_HOVER_CLASS_NAME)} style={CHANGED_FILE_CHIP_STYLE}>
                        {expanded ? (
                            <span className="inline-flex h-[round(1.35em,1px)] items-center">
                                <Icon name="arrow-up-s" className="h-3.5 w-3.5" />
                            </span>
                        ) : `+${hiddenCount}`}
                    </span>
                </button>
            </HoverTooltip>
        </>
    );
});
