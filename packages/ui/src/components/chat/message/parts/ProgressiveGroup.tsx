import { isReadTool, parseNativeReadPath, toolInputPath } from '@/lib/toolHelpers';
import type { ToolCallPart } from '@openchamber/agent-contract';
import React from 'react';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { cn } from '@/lib/utils';
import type { TurnActivityRecord as TurnActivityPart } from '../../lib/turns/types';
import type { StreamPhase } from '../types';
import type { ToolPopupContent } from '../types';
import ToolPart from './ToolPart';
import { BlockLine } from './BlockLine';
import { MinDurationShineText } from './MinDurationShineText';
import { ToolRevealOnMount } from './ToolRevealOnMount';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Text } from '@/components/ui/text';
import { Icon } from "@/components/icon/Icon";
import { FadeInOnReveal } from '../FadeInOnReveal';
import { getToolIcon } from './toolPresentation';
import { toolGrouping, toolPresentation, describeToolCall } from '@/lib/toolPresentation';
import { useGuestToolPresentation } from '@/lib/guests/tool-presentation';
import { isExpandableTool, isStandaloneTool, isStaticTool } from './toolRenderUtils';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';

import ReasoningPart from './ReasoningPart';
import JustificationBlock from './JustificationBlock';
import { areRenderRelevantPartsEqual } from '../renderCompare';
import { getDirectoryForFilePath, getRelativeFilePath, isFilePathWithinDirectory, toAbsoluteFilePath } from '@/lib/path-utils';

const TOOL_ROW_TEXT_CLASS = '!text-[length:var(--text-meta)] !leading-5 sm:!leading-6 tracking-normal';
const TOOL_ROW_TITLE_CLASS = cn('typography-meta font-normal', TOOL_ROW_TEXT_CLASS);
const TOOL_ROW_DESCRIPTION_CLASS = cn('typography-meta', TOOL_ROW_TEXT_CLASS);

interface ProgressiveGroupProps {
    parts: TurnActivityPart[];
    contextParts?: TurnActivityPart[];
    sessionId?: string;
    directory?: string | null;
    isExpanded: boolean;
    collapsedPreviewCount?: number;
    onToggle: () => void;
    isMobile: boolean;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    streamPhase: StreamPhase;
    showHeader: boolean;
    animateRows?: boolean;
    animatedToolIds?: Set<string>;
    renderJustificationActions?: (activity: TurnActivityPart) => React.ReactNode;
}

const isActivityRunning = (activity: TurnActivityPart): boolean => {
    const part = activity.part;
    return activity.kind === 'tool' && part.type === 'tool_call'
        && (part.status === 'pending_approval' || part.status === 'approved' || part.status === 'running');
};

const sortPartsByTime = (parts: TurnActivityPart[]): TurnActivityPart[] => parts;

/**
 * Extract a short filename from a tool part's input (for aggregation display).
 */
const getToolFileName = (activity: TurnActivityPart): string | null => {
    const path = getToolFilePath(activity);
    const displayPath = path ? parseNativeReadPath(path).path : null;
    return displayPath ? displayPath.slice(displayPath.lastIndexOf('/') + 1) : null;
};
const getToolFilePath = (activity: TurnActivityPart): string | null => {
    return activity.part.type === 'tool_call' ? toolInputPath(activity.part.input) : null;
};


const renderReadFilePath = (displayPath: string, animate = true) => {
    const lastSlash = displayPath.lastIndexOf('/');

    if (lastSlash === -1) {
        return (
            <Text
                variant={animate ? 'generate-effect' : 'static'}
                className={cn('min-w-0 flex-1 truncate whitespace-nowrap', TOOL_ROW_DESCRIPTION_CLASS)}
                style={{ color: 'var(--tools-title)' }}
                title={displayPath}
            >
                {displayPath}
            </Text>
        );
    }

    const dir = displayPath.slice(0, lastSlash);
    const name = displayPath.slice(lastSlash + 1);
    const hasAbsoluteRoot = dir.startsWith('/');
    const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir;

    return (
        <span className={cn('min-w-0 inline-flex max-w-full flex-1 items-baseline overflow-hidden', TOOL_ROW_DESCRIPTION_CLASS)} title={displayPath}>
            {hasAbsoluteRoot ? <span className="flex-shrink-0" style={{ color: 'var(--tools-description)' }}>/</span> : null}
            <span
                className="min-w-0 shrink truncate whitespace-nowrap"
                style={{
                    color: 'var(--tools-description)',
                    direction: 'rtl',
                    textAlign: 'left',
                    unicodeBidi: 'plaintext',
                }}
            >
                {displayDir}
            </span>
            <span className="flex-shrink-0" style={{ color: 'var(--tools-description)' }}>/</span>
            <Text
                variant={animate ? 'generate-effect' : 'static'}
                className="flex-shrink-0"
                style={{ color: 'var(--tools-title)' }}
            >
                {name}
            </Text>
        </span>
    );
};


const SHORT_DESCRIPTION_MAX = 50;

const getToolShortDescription = (activity: TurnActivityPart): string | null => {
    const part = activity.part;
    if (part.type !== 'tool_call') return getToolFileName(activity);
    const described = describeToolCall(part.input, part.toolName);
    if (!described) return getToolFileName(activity);
    return described.length > SHORT_DESCRIPTION_MAX
        ? `${described.slice(0, SHORT_DESCRIPTION_MAX)}...`
        : described;
};

type AggregatedRow =
    | { type: 'tool-expandable'; activity: TurnActivityPart }
    | { type: 'tool-static-group'; toolName: string; activities: TurnActivityPart[] }
    | { type: 'reasoning'; activity: TurnActivityPart }
    | { type: 'justification'; activity: TurnActivityPart }
    | { type: 'tool-fallback'; activity: TurnActivityPart };

interface ExpandableToolRowProps {
    activity: TurnActivityPart;
    pairedCall?: ToolCallPart;
    sessionId?: string;
    directory?: string | null;
    isExpanded: boolean;
    isMobile: boolean;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    animateTailText: boolean;
}

const ExpandableToolRow: React.FC<ExpandableToolRowProps> = ({
    activity,
    pairedCall,
    sessionId,
    directory,
    isExpanded,
    isMobile,
    onToggleTool,
    onShowPopup,
    animateTailText,
}) => {
    const handleToggle = React.useCallback(() => {
        onToggleTool(activity.part.partId);
    }, [activity.part.partId, onToggleTool]);

    if (activity.part.type !== 'tool_call' && activity.part.type !== 'tool_result') return null;

    const content = (
        <ToolPart
            part={activity.part}
            pairedCall={pairedCall}
            sessionId={sessionId}
            directory={directory}
            isExpanded={isExpanded}
            onToggle={handleToggle}
            isMobile={isMobile}
            onShowPopup={onShowPopup}
            animateTailText={animateTailText}
        />
    );

    // Wrappers are unconditional: a conditional wrapper changes the element
    // type at this position when animateTailText/animateRows flip (message
    // completion), remounting the tool subtree and replaying the reveal wipe.
    // Both wrappers are inert with animation off.
    return (
        <FadeInOnReveal>
            <ToolRevealOnMount animate={animateTailText} wipe>
                {content}
            </ToolRevealOnMount>
        </FadeInOnReveal>
    );
};

const MemoExpandableToolRow = React.memo(ExpandableToolRow, (prev, next) => {
    return prev.isExpanded === next.isExpanded
        && prev.isMobile === next.isMobile
        && prev.sessionId === next.sessionId
        && prev.directory === next.directory
        && prev.pairedCall === next.pairedCall
        && prev.onToggleTool === next.onToggleTool
        && prev.onShowPopup === next.onShowPopup
        && prev.animateTailText === next.animateTailText
        && prev.activity.part.partId === next.activity.part.partId
        && prev.activity.kind === next.activity.kind
        && prev.activity.endedAt === next.activity.endedAt
        && areRenderRelevantPartsEqual([prev.activity.part], [next.activity.part]);
});

interface StaticGroupedToolRowProps {
    toolName: string;
    activities: TurnActivityPart[];
    animateTailText: boolean;
}

const StaticGroupedToolRow: React.FC<StaticGroupedToolRowProps> = ({
    toolName,
    activities,
    animateTailText,
}) => {
    const content = (
        <StaticToolRow
            toolName={toolName}
            activities={activities}
            animateTailText={animateTailText}
        />
    );

    // Wrappers are unconditional: a conditional wrapper changes the element
    // type at this position when animateTailText/animateRows flip (message
    // completion), remounting the tool subtree and replaying the reveal wipe.
    // Both wrappers are inert with animation off.
    return (
        <FadeInOnReveal>
            <ToolRevealOnMount animate={animateTailText} wipe>
                {content}
            </ToolRevealOnMount>
        </FadeInOnReveal>
    );
};

const MemoStaticGroupedToolRow = React.memo(StaticGroupedToolRow, (prev, next) => {
    return prev.toolName === next.toolName
        && prev.animateTailText === next.animateTailText
        && areActivityListsEqual(prev.activities, next.activities);
});

/**
 * Aggregate sorted activity parts into display rows.
 * Static tools are rendered as one row per call.
 * Reasoning/justification become inline text.
 * Expandable tools (edit, bash, write, question) stay as individual rows.
 * Unknown tools stay as individual expandable rows (fallback).
 */
const aggregateRows = (parts: TurnActivityPart[], pairedResultKeys: ReadonlySet<string>): AggregatedRow[] => {
    const rows: AggregatedRow[] = [];

    let i = 0;
    while (i < parts.length) {
        const activity = parts[i];

        if (activity.kind === 'reasoning') {
            rows.push({ type: 'reasoning', activity });
            i++;
            continue;
        }

        if (activity.kind === 'justification') {
            rows.push({ type: 'justification', activity });
            i++;
            continue;
        }

        // Tool part
        const toolPart = activity.part;
        if (toolPart.type !== 'tool_call' && toolPart.type !== 'tool_result') {
            i++;
            continue;
        }
        const toolName = toolPart.toolName;

        // One operation renders one row: the matched result already carries the
        // call as paired context, so the call must not also produce a header.
        if (toolPart.type === 'tool_call' && pairedResultKeys.has(`${activity.turnId}\n${toolPart.toolCallId}\n${toolPart.toolName}`)) {
            i++;
            continue;
        }

        // Result bodies and errors remain inspectable even for compact read calls.
        if (toolPart.type === 'tool_result') {
            rows.push({ type: 'tool-expandable', activity });
            i++;
            continue;
        }

        if (isStandaloneTool(toolName)) {
            // Standalone tools are rendered separately, skip
            i++;
            continue;
        }

        if (isExpandableTool(toolName)) {
            rows.push({ type: 'tool-expandable', activity });
            i++;
            continue;
        }

        if (isStaticTool(toolName)) {
            rows.push({ type: 'tool-static-group', toolName, activities: [activity] });
            i++;
            continue;
        }

        // Unknown/fallback tool — keep as expandable
        rows.push({ type: 'tool-fallback', activity });
        i++;
    }

    return rows;
};

const areActivityListsEqual = (left: TurnActivityPart[], right: TurnActivityPart[]): boolean => {
    if (left === right) {
        return true;
    }

    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        const leftActivity = left[index];
        const rightActivity = right[index];

        if (leftActivity.part.partId !== rightActivity.part.partId) {
            return false;
        }

        if (leftActivity.kind !== rightActivity.kind || leftActivity.endedAt !== rightActivity.endedAt) {
            return false;
        }

        if (!areRenderRelevantPartsEqual([leftActivity.part], [rightActivity.part])) {
            return false;
        }
    }

    return true;
};

const StaticToolRowInner: React.FC<{
    toolName: string;
    activities: TurnActivityPart[];
    animateTailText: boolean;
}> = ({ toolName, activities, animateTailText }) => {
    const showToolFileIcons = useUIStore((state) => state.showToolFileIcons);
    // Grouped rows share one normalized name; the registry wants the full
    // name the canonical part reported, which every activity in the group carries.
    const firstPart = activities[0]?.part;
    const presentation = useGuestToolPresentation(firstPart?.type === 'tool_call' || firstPart?.type === 'tool_result' ? firstPart.toolName : null);
    const displayName = presentation?.name ?? toolPresentation(toolName).label;
    const icon = getToolIcon(toolName, presentation);
    const isReadGroup = isReadTool(toolName);
    const runtime = React.useContext(RuntimeAPIContext);
    const mobileActions = useMobileAppActions();
    const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

    const hasRunningActivity = React.useMemo(() => activities.some((activity) => isActivityRunning(activity)), [activities]);

    const descriptions = React.useMemo(() => {
        const descs: string[] = [];
        for (const activity of activities) {
            const desc = getToolShortDescription(activity);
            if (desc && !descs.includes(desc)) {
                descs.push(desc);
            }
        }
        return descs;
    }, [activities]);



    const readFileEntries = React.useMemo(() => {
        if (!isReadGroup) return [] as Array<{ path: string; displayPath: string; offset?: number }>;

        const entries: Array<{ path: string; displayPath: string; offset?: number }> = [];
        for (const activity of activities) {
            const rawPath = getToolFilePath(activity);
            if (!rawPath) continue;
            const { path: filePath, line: offset } = parseNativeReadPath(rawPath);
            if (!filePath) continue;
            if (entries.some((entry) => entry.path === filePath)) continue;
            const displayPath = getRelativeFilePath(filePath, currentDirectory);
            if (!displayPath) continue;
            entries.push({ path: filePath, displayPath, offset });
        }
        return entries;
    }, [activities, currentDirectory, isReadGroup]);

    const handleFileClick = React.useCallback((filePath: string, offset?: number) => {
        const absolutePath = toAbsoluteFilePath(currentDirectory, filePath);
        if (!absolutePath) {
            return;
        }

        if (runtime?.editor) {
            void runtime.editor.openFile(absolutePath, offset);
            return;
        }

        if (mobileActions) {
            const uiStore = useUIStore.getState();
            const contextDirectory = currentDirectory || getDirectoryForFilePath(currentDirectory, absolutePath);
            if (offset && Number.isFinite(offset)) {
                uiStore.openContextFileAtLine(contextDirectory, absolutePath, Math.max(1, Math.trunc(offset)), 1);
            } else {
                uiStore.openContextFile(contextDirectory, absolutePath);
            }
            mobileActions.openFiles();
            return;
        }

        if (!isFilePathWithinDirectory(absolutePath, currentDirectory)) {
            const uiStore = useUIStore.getState();
            const contextDirectory = currentDirectory || getDirectoryForFilePath(currentDirectory, absolutePath);
            if (offset && Number.isFinite(offset)) {
                uiStore.openContextFileAtLine(contextDirectory, absolutePath, Math.max(1, Math.trunc(offset)), 1);
                return;
            }
            uiStore.openContextFile(contextDirectory, absolutePath);
            return;
        }

        const uiStore = useUIStore.getState();
        const contextDirectory = getDirectoryForFilePath(currentDirectory, absolutePath);
        if (offset && Number.isFinite(offset)) {
            uiStore.openContextFileAtLine(contextDirectory, absolutePath, Math.max(1, Math.trunc(offset)), 1);
            return;
        }
        uiStore.openContextFile(contextDirectory, absolutePath);
    }, [currentDirectory, mobileActions, runtime]);

    const isSearchGroup = toolGrouping(toolName) === 'search';

    return (
        <div
            className={cn(
                'oc-static-tool-row flex w-full items-center gap-x-1.5 pr-2 pl-px py-1.5 rounded-xl min-w-0'
            )}
        >
            <div className="inline-flex h-5 items-center flex-shrink-0" style={{ color: 'var(--tools-icon)' }}>
                {icon}
            </div>
            <MinDurationShineText
                active={hasRunningActivity}
                minDurationMs={1000}
                className={cn(TOOL_ROW_TITLE_CLASS, 'inline-flex items-center flex-shrink-0')}
                style={{ color: 'var(--tools-description)' }}
                title={displayName}
            >
                {displayName}
            </MinDurationShineText>
            {isReadGroup && readFileEntries.length > 0
                ? readFileEntries.map((entry) => (
                    <button
                        key={entry.path}
                        type="button"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleFileClick(entry.path, entry.offset);
                        }}
                        className={cn('inline-flex !min-h-0 items-center justify-start gap-1 min-w-0 flex-1 text-left hover:opacity-90', TOOL_ROW_DESCRIPTION_CLASS)}
                        style={{ color: 'var(--tools-description)' }}
                        title={entry.offset ? `${entry.displayPath}:${entry.offset}` : entry.displayPath}
                    >
                        {showToolFileIcons ? <FileTypeIcon filePath={entry.path} className="h-3.5 w-3.5" /> : null}
                        {renderReadFilePath(entry.displayPath, animateTailText)}
                    </button>
                ))
                : null}
            {isSearchGroup && descriptions.length > 0
                ? descriptions.map((desc, index) => (
                    <span key={`${desc}-${index}`} className="inline-flex min-w-0 flex-1">
                        <Text
                            variant={animateTailText ? 'generate-effect' : 'static'}
                            className={cn('min-w-0 flex-1 truncate whitespace-nowrap', TOOL_ROW_DESCRIPTION_CLASS)}
                            style={{ color: 'var(--tools-title)' }}
                            title={desc}
                        >
                            "{desc}"
                        </Text>
                    </span>
                ))
                : null}
            {!isReadGroup && !isSearchGroup && descriptions.length > 0 ? (
                <Text
                    variant={animateTailText ? 'generate-effect' : 'static'}
                    className={cn('min-w-0 flex-1 truncate whitespace-nowrap', TOOL_ROW_DESCRIPTION_CLASS)}
                    style={{ color: 'var(--tools-title)' }}
                >
                    {descriptions.join(' ')}
                </Text>
            ) : null}
        </div>
    );
};

export const StaticToolRow = React.memo(StaticToolRowInner, (prev, next) => {
    return prev.toolName === next.toolName
        && prev.animateTailText === next.animateTailText
        && areActivityListsEqual(prev.activities, next.activities);
});

/**
 * Inline reasoning text block — rendered as dimmed italic markdown.
 */
const InlineReasoningBlock = React.memo(({ activity, streamPhase }: {
    activity: TurnActivityPart;
    streamPhase: StreamPhase;
}) => {
    if (activity.part.type !== 'reasoning') return null;
    return (
        <ReasoningPart
            part={activity.part}
            messageId={activity.messageId}
            streamPhase={streamPhase}
        />
    );
});

/**
 * Inline justification text block — rendered as normal assistant text between tools.
 */
const InlineJustificationBlock = React.memo(({ activity, actions }: {
    activity: TurnActivityPart;
    actions?: React.ReactNode;
}) => {
    if (activity.part.type !== 'text') return null;
    return (
        <JustificationBlock
            part={activity.part}
            messageId={activity.messageId}
            actions={actions}
        />
    );
});

const ProgressiveGroup: React.FC<ProgressiveGroupProps> = ({
    parts,
    contextParts,
    sessionId,
    directory,
    isExpanded,
    collapsedPreviewCount = 0,
    onToggle,
    isMobile,
    expandedTools,
    onToggleTool,
    onShowPopup,
    streamPhase,
    showHeader,
    animateRows = true,
    animatedToolIds,
    renderJustificationActions,
}) => {
    const previewCount = showHeader && !isExpanded
        ? Math.max(0, Math.floor(collapsedPreviewCount))
        : 0;
    const shouldRenderRows = !showHeader || isExpanded || previewCount > 0;

    const sortedParts = React.useMemo(() => {
        if (!shouldRenderRows) {
            return [] as TurnActivityPart[];
        }
        return sortPartsByTime(parts);
    }, [parts, shouldRenderRows]);

    const pairedResultKeys = React.useMemo(() => {
        const keys = new Set<string>();
        for (const activity of contextParts ?? parts) {
            if (activity.part.type === 'tool_result') {
                keys.add(`${activity.turnId}\n${activity.part.toolCallId}\n${activity.part.toolName}`);
            }
        }
        return keys;
    }, [contextParts, parts]);

    const rows = React.useMemo(() => {
        if (!shouldRenderRows) {
            return [] as AggregatedRow[];
        }
        return aggregateRows(sortedParts, pairedResultKeys);
    }, [shouldRenderRows, sortedParts, pairedResultKeys]);

    const callsByTurn = React.useMemo(() => {
        const turns = new Map<string, Map<string, ToolCallPart>>();
        for (const activity of contextParts ?? parts) {
            if (activity.part.type !== 'tool_call') continue;
            let calls = turns.get(activity.turnId);
            if (!calls) {
                calls = new Map();
                turns.set(activity.turnId, calls);
            }
            calls.set(activity.part.toolCallId, activity.part);
        }
        return turns;
    }, [contextParts, parts]);

    const previewHiddenCount = React.useMemo(() => {
        if (isExpanded || previewCount === 0) {
            return 0;
        }
        return Math.max(0, rows.length - previewCount);
    }, [isExpanded, previewCount, rows.length]);

    const visibleRows = React.useMemo(() => {
        if (isExpanded || previewCount === 0) {
            return rows;
        }
        return rows.slice(-previewCount);
    }, [isExpanded, previewCount, rows]);

    if (shouldRenderRows && rows.length === 0) {
        return null;
    }

    const wrapRow = (key: string, content: React.ReactNode) => {
        if (!animateRows) {
            return <React.Fragment key={key}>{content}</React.Fragment>;
        }
        return <FadeInOnReveal key={key}>{content}</FadeInOnReveal>;
    };

    const renderedRows = shouldRenderRows
        ? visibleRows.map((row, index) => {
        switch (row.type) {
            case 'reasoning':
                return wrapRow(
                    row.activity.part.partId,
                    <>
                        <InlineReasoningBlock
                            activity={row.activity}
                            streamPhase={streamPhase}
                        />
                    </>
                );

            case 'justification':
                return wrapRow(
                    row.activity.part.partId,
                    <>
                        <InlineJustificationBlock
                            activity={row.activity}
                            actions={renderJustificationActions?.(row.activity)}
                        />
                    </>
                );

            case 'tool-expandable':
                return (
                    <MemoExpandableToolRow
                        key={row.activity.part.type === 'tool_result'
                            ? callsByTurn.get(row.activity.turnId)?.get(row.activity.part.toolCallId)?.partId ?? row.activity.part.partId
                            : row.activity.part.partId}
                        activity={row.activity}
                        pairedCall={row.activity.part.type === 'tool_result' ? callsByTurn.get(row.activity.turnId)?.get(row.activity.part.toolCallId) : undefined}
                        sessionId={sessionId}
                        directory={directory}
                        isExpanded={expandedTools.has(row.activity.part.partId)}
                        isMobile={isMobile}
                        onToggleTool={onToggleTool}
                        onShowPopup={onShowPopup}
                        animateTailText={Boolean(animatedToolIds?.has(row.activity.part.partId))}
                    />
                );

            case 'tool-static-group':
                return (
                    <MemoStaticGroupedToolRow
                        key={`static-${row.toolName}-${row.activities[0]?.part.partId ?? index}`}
                        toolName={row.toolName}
                        activities={row.activities}
                        animateTailText={row.activities.some((activity) => animatedToolIds?.has(activity.part.partId))}
                    />
                );

            case 'tool-fallback':
                return (
                    <MemoExpandableToolRow
                        key={row.activity.part.type === 'tool_result'
                            ? callsByTurn.get(row.activity.turnId)?.get(row.activity.part.toolCallId)?.partId ?? row.activity.part.partId
                            : row.activity.part.partId}
                        activity={row.activity}
                        pairedCall={row.activity.part.type === 'tool_result' ? callsByTurn.get(row.activity.turnId)?.get(row.activity.part.toolCallId) : undefined}
                        sessionId={sessionId}
                        directory={directory}
                        isExpanded={expandedTools.has(row.activity.part.partId)}
                        isMobile={isMobile}
                        onToggleTool={onToggleTool}
                        onShowPopup={onShowPopup}
                        animateTailText={Boolean(animatedToolIds?.has(row.activity.part.partId))}
                    />
                );

            default:
                return null;
        }
    })
        : null;

    const shouldShowRowsContainer = isExpanded || visibleRows.length > 0;

    if (!showHeader) {
        return (
            <FadeInOnReveal>
                <div className="mt-1 mb-2">{renderedRows}</div>
            </FadeInOnReveal>
        );
    }

    return (
        <FadeInOnReveal>
            <div className="mt-1 mb-2">
                <button
                    type="button"
                    className="group/tool flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 pr-2 pl-px py-1.5 rounded-xl text-left"
                    onClick={onToggle}
                >
                    <span className="inline-flex h-5 items-center flex-shrink-0" style={{ color: 'var(--tools-icon)' }}>
                        <Icon name="stack" className="h-3.5 w-3.5" />
                    </span>
                    <span
                        className="leading-5 font-semibold inline-flex h-5 items-center flex-shrink-0"
                        style={{
                            color: 'var(--tools-title)',
                            fontSize: '0.9rem',
                            letterSpacing: '0.005em',
                        }}
                    >
                        Activity
                    </span>
                </button>
                {shouldShowRowsContainer ? (
                    <div className="relative ml-2 pl-3">
                        <BlockLine onToggle={onToggle} topOffset={1} />
                        {previewHiddenCount > 0 ? (
                            <button
                                type="button"
                                onClick={onToggle}
                                className="typography-meta leading-4 px-2 py-1 text-muted-foreground/45 hover:text-muted-foreground/65 text-left"
                            >
                                +{previewHiddenCount} more...
                            </button>
                        ) : null}
                        {/* No gap between rows: each row carries its own padding, and
                            the live timeline stacks the same rows with nothing between
                            them, so the sorted view keeps the identical rhythm. */}
                        <div>{renderedRows}</div>
                    </div>
                ) : null}
            </div>
        </FadeInOnReveal>
    );
};

export default React.memo(ProgressiveGroup);
