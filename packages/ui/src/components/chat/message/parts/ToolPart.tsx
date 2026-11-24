import React from 'react';
import type { JsonValue, Subagent, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { z } from 'zod';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { getSyncSessions } from '@/sync/sync-refs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useChatColumnActions, useChatSessionSelection } from '../../chatColumnSession';
import { dispatchRowExpand } from '@/components/chat/lib/scroll/timelineScrollIntent';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { BlockLine } from './BlockLine';
import { FormMarkdown } from '../../FormMarkdown';
import {
    askAnswers,
    isAstEditTool,
    detectToolOutputLanguage,
    flatScalarInputRows,
    formatToolInput,
    isEditTool,
    isEvalTool,
    isFindTool,
    isQuestionTool,
    isRawInputSuppressedTool,
    isReadTool,
    isShellTool,
    isSubagentTool,
    isTodoTool,
    isVibeSubagentTool,
    isWebSearchTool,
    isWriteTool,
    toolInputPaths,
    normalizeToolName,
    toolBaseName,
    parseNativeReadPath,
    toolInputPath,
    toolPresentation,
} from '@/lib/toolHelpers';
import { describeTaskResultWithSubagents, describeToolCall, describeToolResult, evalResultSummary, isMemoryTool, normalizeIntent, type TaskSubagentStatusEntry } from '@/lib/toolPresentation';
import { VibeToolCard } from './VibeToolCard';
import { WaitToolCard } from './WaitToolCard';
import { StructuredToolCard } from './StructuredToolCards';
import { isStructuredCardTool, preferredDisplayContent } from './toolDisplayContent';
import { TodoCard } from './TodoCard';
import { MemoryToolCard } from './MemoryToolCard';
import { extractTodoPhases } from '../../todoData';
import { hasTodoTasks } from '../../todoProgress';
import { toolDisplayStyles } from '@/lib/typography';
import { HighlightedCode } from '@/components/code/HighlightedCode';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { ToolPopupContent } from '../types';
import { PlainDiffFallback } from './PlainDiffFallback';
import { isToolDiffPreviewOversized } from './toolDiffPreview';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import { JsonSummaryView } from './JsonSummaryView';
import { JsonTreeViewer } from '@/components/ui/JsonTreeViewer';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { DiffViewToggle, type DiffViewMode } from '../DiffViewToggle';
import { EvalPresenter } from './EvalPresenter';
import { MinDurationShineText } from './MinDurationShineText';
import { getToolIcon } from './toolPresentation';
import { OpenChamberToolOutput } from './OpenChamberToolOutput';
import { toToolView } from './toolView';
import { hasOpenChamberView, parseOpenChamberEnvelope } from './openChamberToolEnvelope';
import { GuestToolTable } from './GuestToolTable';
import { GuestToolCard } from './GuestToolCard';
import {
    guestToolTableRows,
    resolveGuestToolCard,
    renderGuestToolHeader,
    useGuestToolPresentation,
    type GuestToolRule,
} from '@/lib/guests/tool-presentation';
import {
    capToolOutputText,
    coerceToText,
    nativeToolResultContent,
    renderWebSearchOutput,
    tryParseJsonOutput,
    unwrapTextBlocks,
} from '../toolRenderers';
import { renderTerminalOutput } from './toolOutput';
import {
    extractFirstChangedLineFromDiff,
    getToolDiffs,
    getToolFileChanges,
    normalizeWorkspaceToolPath,
    resolveToolQuickOpenTarget,
    type ToolFileChange,
} from './toolDiffUtils';
import { getDirectoryForFilePath, getRelativeFilePath, toAbsoluteFilePath } from '@/lib/path-utils';
import { useI18n } from '@/lib/i18n';
import { areRenderRelevantPartsEqual } from '../renderCompare';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { collectSubagentReports } from '../../work-status/useSubagentReports';
import { SyncRuntimeContext } from '@/sync/sync-runtime-context';
import { openSubagentsPanel } from '@/components/chat/subagents/panel';
import { isVSCodeRuntime } from '@/lib/desktop';
import { OpenSubtaskButton } from './toolRow/OpenSubtaskButton';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { WritePreview } from '../../DiffPreview';

const EMPTY_SUBAGENTS: Subagent[] = [];
const EMPTY_STRING_ARRAY: readonly string[] = [];

const DISPLAY_CONTENT_TOOL_NAMES = {
    read: true,
    grep: true,
    ast_grep: true,
} as const;

const VIBE_TOOL_NAMES = {
    vibe_spawn: true,
    vibe_send: true,
    vibe_wait: true,
    vibe_kill: true,
    vibe_list: true,
} as const;

const WAIT_TOOL_NAMES = {
    wait: true,
} as const;


const vibeSpawnInputSchema = z.object({
    name: z.string().trim().min(1).optional(),
});

const vibeSpawnDetailsSchema = z.object({
    spawned: z.object({
        id: z.string().trim().min(1),
    }).optional(),
});

const serializeVibeSpawnSubagent = (
    list: readonly Subagent[] | undefined,
    parentSessionId: string,
    toolCallId: string,
    workerId: string,
): string => {
    if (!list || list.length === 0) return '';
    const byToolCall = toolCallId
        ? list.find((child) => child.parentSessionId === parentSessionId && child.toolCallId === toolCallId && Boolean(child.childSessionId))
        : undefined;
    const byWorker = !byToolCall && workerId
        ? list.find((child) => child.parentSessionId === parentSessionId && (child.name === workerId || child.subagentId === workerId) && Boolean(child.childSessionId))
        : undefined;
    const matched = byToolCall ?? byWorker;
    if (!matched?.childSessionId) return '';
    const label = matched.name?.trim() || workerId || matched.role;
    return [matched.childSessionId, matched.role, label].join('\u0000');
};

const taskCallExpectedIdsSchema = z.object({
    name: z.string().trim().min(1).optional(),
    tasks: z.array(z.object({
        name: z.string().trim().min(1).optional(),
    })).optional(),
});

const serializeTaskSubagentStatuses = (
    list: readonly Subagent[] | undefined,
    taskSessionId: string,
    toolCallId: string,
): string => {
    if (!list || list.length === 0) return '';
    const rows: string[] = [];
    for (const child of list) {
        if (child.parentSessionId !== taskSessionId || child.toolCallId !== toolCallId) continue;
        rows.push([
            child.subagentId,
            child.childSessionId ?? '',
            child.name ?? '',
            child.status,
        ].join('\u0000'));
    }
    return rows.join('\n');
};

const parseTaskSubagentStatuses = (serialized: string): TaskSubagentStatusEntry[] => {
    if (!serialized) return [];
    return serialized.split('\n').map((line) => {
        const [id = '', childSessionId = '', name = '', status = ''] = line.split('\u0000');
        const entry: TaskSubagentStatusEntry = { id, status };
        if (childSessionId) entry.childSessionId = childSessionId;
        if (name) entry.name = name;
        return entry;
    });
};

const serializeReportStatuses = (
    reports: ReadonlyMap<string, { state: string }>,
    targetIds: readonly string[],
): string => {
    if (reports.size === 0 || targetIds.length === 0) return '';
    const rows: string[] = [];
    for (const id of targetIds) {
        const report = reports.get(id);
        if (report) rows.push(`${id}\u0000${report.state}`);
    }
    return rows.join('\n');
};

const parseReportStatuses = (serialized: string): Map<string, string> => {
    const map = new Map<string, string>();
    if (!serialized) return map;
    for (const line of serialized.split('\n')) {
        const sep = line.indexOf('\u0000');
        if (sep > 0) map.set(line.slice(0, sep), line.slice(sep + 1));
    }
    return map;
};

const taskProgressItemSchema = z.object({
    id: z.string(),
    agent: z.string(),
    status: z.string().optional(),
    lastIntent: z.string().optional(),
    currentTool: z.string().optional(),
    currentToolArgs: z.string().optional(),
    stage: z.string().optional(),
});

const taskResultDetailsSchema = z.object({
    progress: z.array(taskProgressItemSchema).optional(),
    async: z.object({
        state: z.string().optional(),
        jobId: z.string().optional(),
    }).optional(),
});

const TASK_SPAWN_ACK_LINE_RE = /^(?:Spawned\s+(?:agent\s+`[^`]+`\s+\(job\s+`[^`]+`\)\.?|\d+\s+background\s+agents?(?:\s+using\s+[^.]+)?\.?(?:\s+Failed\s+to\s+schedule\s+.+)?)|Running\s+.+?\s+inline;\s+\d+\s+background\s+agents?\.?|-\s+`[^`]+`\s+\(job\s+`[^`]+`\)|read\s+proc:\/\/\s+lists\s+jobs\/services.*|Job\s+IDs\s+are\s+process-local.*|Tip:\s+this\s+call\s+spawned\s+\d+\s+generic\s+workers.*|\d+\s+siblings\s+run\s+together\..*)$/i;

function stripTaskSpawnBoilerplate(raw: string): string {
    const kept = raw
        .split('\n')
        .filter((line) => !TASK_SPAWN_ACK_LINE_RE.test(line.trim()));
    return kept.join('\n').trim();
}

// Native write input and ask input contracts; tool inputs are arbitrary JSON on
// the canonical part, so each renderer parses the shape it consumes.
const writeInputSchema = z.object({
    path: z.string(),
    content: z.string().optional(),
});
const askOptionSchema = z.object({
    label: z.string(),
    description: z.string().optional(),
    preview: z.string().optional(),
});
const askQuestionSchema = z.object({
    id: z.string(),
    question: z.string(),
    header: z.string().optional(),
    options: z.array(askOptionSchema),
    multi: z.boolean().optional(),
    recommended: z.number().optional(),
});
const askInputSchema = z.object({
    questions: z.array(askQuestionSchema).min(1),
});

const bashAsyncDetailsSchema = z.object({
    jobId: z.string().min(1),
    state: z.string().min(1),
});

const bashServiceDetailsSchema = z.object({
    name: z.string().min(1),
    state: z.string().optional(),
    ready: z.boolean().optional(),
    timedOut: z.boolean().optional(),
    pid: z.number().optional(),
});

const bashStatusDetailsSchema = z.object({
    async: bashAsyncDetailsSchema.optional(),
    service: bashServiceDetailsSchema.optional(),
});

type ParsedFindLine =
    | { kind: 'hit'; filePath: string; startLine: number; endLine?: string; score?: number; snippet: string }
    | { kind: 'header'; filePath: string; score: number; meta: string }
    | { kind: 'text'; text: string };

const FIND_URL_SCHEME_RE = /^https?:\/\//i;
const FIND_HIT_TARGET_RE = /^(.+):(\d+)(?:-(\d+))?$/;
const FIND_SCORE_RE = /^([01]\.\d{2})$/;
const FIND_COL_SEP_RE = /\s{2,}/;

function parseFindScore(value: string): number | undefined {
    if (!FIND_SCORE_RE.test(value)) return undefined;
    const score = Number(value);
    return score >= 0 && score <= 1 ? score : undefined;
}

function parseFindLine(line: string): ParsedFindLine {
    const trimmed = line.trimStart();
    const sep1 = FIND_COL_SEP_RE.exec(trimmed);
    if (!sep1) return { kind: 'text', text: line };

    const target = trimmed.slice(0, sep1.index);
    if (!target || FIND_URL_SCHEME_RE.test(target)) {
        return { kind: 'text', text: line };
    }

    const rest1 = trimmed.slice(sep1.index + sep1[0].length);
    const sep2 = FIND_COL_SEP_RE.exec(rest1);
    const hitTarget = FIND_HIT_TARGET_RE.exec(target);
    if (hitTarget?.[1] && hitTarget[2]) {
        const filePath = hitTarget[1];
        if (FIND_URL_SCHEME_RE.test(filePath)) return { kind: 'text', text: line };
        if (sep2) {
            const score = parseFindScore(rest1.slice(0, sep2.index));
            if (score !== undefined) {
                return {
                    kind: 'hit',
                    filePath,
                    startLine: parseInt(hitTarget[2], 10),
                    endLine: hitTarget[3],
                    score,
                    snippet: rest1.slice(sep2.index + sep2[0].length),
                };
            }
        } else {
            const trailingScore = parseFindScore(rest1.trim());
            if (trailingScore !== undefined) {
                return {
                    kind: 'hit',
                    filePath,
                    startLine: parseInt(hitTarget[2], 10),
                    endLine: hitTarget[3],
                    score: trailingScore,
                    snippet: '',
                };
            }
        }
        return {
            kind: 'hit',
            filePath,
            startLine: parseInt(hitTarget[2], 10),
            endLine: hitTarget[3],
            snippet: rest1,
        };
    }

    if (!/^\s/.test(line) && sep2) {
        const score = parseFindScore(rest1.slice(0, sep2.index));
        const meta = rest1.slice(sep2.index + sep2[0].length);
        if (score !== undefined && meta) {
            return {
                kind: 'header',
                filePath: target,
                score,
                meta,
            };
        }
    }

    return { kind: 'text', text: line };
}

function parseFindLines(lines: readonly string[]): ParsedFindLine[] {
    const parsed: ParsedFindLine[] = [];
    let inFailures = false;
    for (const line of lines) {
        if (inFailures) {
            parsed.push({ kind: 'text', text: line });
            continue;
        }
        if (line.trim() === 'failures:') {
            inFailures = true;
            parsed.push({ kind: 'text', text: line });
            continue;
        }
        parsed.push(parseFindLine(line));
    }
    return parsed;
}

function findScoreBadgeStyle(score: number): React.CSSProperties {
    if (score >= 0.7) {
        return {
            color: 'var(--status-success)',
            backgroundColor: 'var(--status-success-background)',
            borderColor: 'var(--status-success-border)',
        };
    }
    if (score >= 0.4) {
        return {
            color: 'var(--status-warning)',
            backgroundColor: 'var(--status-warning-background)',
            borderColor: 'var(--status-warning-border)',
        };
    }
    return {
        color: 'var(--muted-foreground)',
        backgroundColor: 'color-mix(in srgb, var(--surface-muted) 40%, transparent)',
        borderColor: 'var(--border)',
    };
}

const isActiveCallStatus = (status: ToolCallPart['status'] | undefined): boolean =>
    status === 'running' || status === 'approved' || status === 'pending_approval';

interface SubagentStatusIcon { name: IconName; color?: string }
const subagentStatusIcon = (status: string | undefined): SubagentStatusIcon => {
    switch (status) {
        case 'running':
            return { name: 'record-circle', color: 'var(--status-info)' };
        case 'completed':
            return { name: 'checkbox-circle', color: 'var(--status-success)' };
        case 'failed':
            return { name: 'close-circle', color: 'var(--status-error)' };
        case 'cancelled':
        case 'aborted':
            return { name: 'close-circle' };
        default:
            return { name: 'time' };
    }
};

/** Child sessions join a task call by its exact native tool call identity. */
const TaskToolSessions = ({ call, resultDetails, sessionId: addressedSessionId, directory: addressedDirectory, isMobile }: {
    call: ToolCallPart;
    resultDetails?: JsonValue;
    sessionId?: string;
    directory?: string | null;
    isMobile: boolean;
}) => {
    const { t } = useI18n();
    const selection = useChatSessionSelection();
    const column = useChatColumnActions();
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    const sessionId = addressedSessionId ?? selection.sessionId;
    const directory = addressedDirectory ?? selection.directory;
    const allSubagents = useSubagentsStore(
        React.useCallback((state) => (sessionId ? (state.byParent[sessionId] ?? EMPTY_SUBAGENTS) : EMPTY_SUBAGENTS), [sessionId]),
    );
    const isHydrated = useSubagentsStore(
        React.useCallback((state) => Boolean(sessionId && state.hydratedByParent[sessionId] === runtimeKey), [runtimeKey, sessionId]),
    );
    const hydrateFailed = useSubagentsStore(
        React.useCallback((state) => Boolean(sessionId && state.failedByParent?.[sessionId] === runtimeKey), [runtimeKey, sessionId]),
    );
    const children = React.useMemo(
        () => (sessionId ? allSubagents.filter((child) => child.parentSessionId === sessionId && child.toolCallId === call.toolCallId) : EMPTY_SUBAGENTS),
        [allSubagents, call.toolCallId, sessionId],
    );
    const parsedDetails = React.useMemo(() => taskResultDetailsSchema.safeParse(resultDetails).data, [resultDetails]);
    const progressFallback = React.useMemo(
        () => (children.length === 0 ? (parsedDetails?.progress ?? []) : []),
        [children.length, parsedDetails?.progress],
    );

    const ownerKey = `${sessionId ?? ''}\0${runtimeKey}\0${call.toolCallId}`;
    const [hydratingToken, setHydratingToken] = React.useState<string | null>(null);
    const hydrating = hydratingToken?.startsWith(`${ownerKey}\0`) ?? false;
    const mountedRef = React.useRef(true);
    const hydrateSeqRef = React.useRef(0);
    const prevCallRef = React.useRef<{ ownerKey: string; status: ToolCallPart['status'] | undefined }>({
        ownerKey: '',
        status: undefined,
    });

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runHydrate = React.useCallback((force: boolean) => {
        if (!sessionId || !directory) return;
        const token = `${ownerKey}\0${++hydrateSeqRef.current}`;
        setHydratingToken(token);
        void useSubagentsStore.getState().hydrateParent(sessionId, force).finally(() => {
            if (mountedRef.current) {
                setHydratingToken((current) => (current === token ? null : current));
            }
        });
    }, [directory, ownerKey, sessionId]);

    React.useEffect(() => {
        const prev = prevCallRef.current;
        const prevStatus = prev.ownerKey === ownerKey ? prev.status : undefined;
        prevCallRef.current = { ownerKey, status: call.status };
        if (!sessionId || !directory) return;
        const settledTransition = isActiveCallStatus(prevStatus) && !isActiveCallStatus(call.status);
        if (!isHydrated || settledTransition) {
            runHydrate(settledTransition);
        }
    }, [call.status, directory, isHydrated, ownerKey, runHydrate, sessionId]);

    React.useEffect(() => {
        if (!sessionId || !directory || children.length === 0) return;
        const global = useGlobalSessionsStore.getState();
        const parent = getSyncSessions(directory).find((session) => session.sessionId === sessionId) ?? global.entityById.get(sessionId);
        if (parent) global.upsertSubagents(parent, children);
    }, [children, directory, sessionId]);

    if (!sessionId || !directory) return null;

    const openChild = (child: Subagent) => {
        if (!child.childSessionId) return;
        const label = child.name?.trim() || child.role;
        if (column.pinned) column.openSession(child.childSessionId, directory);
        else if (isMobile) useSessionUIStore.getState().setCurrentSession(child.childSessionId, directory);
        else useUIStore.getState().openContextPanelTab(directory, {
            mode: 'chat', dedupeKey: `session:${child.childSessionId}`, label, readOnly: true,
        });
    };

    const isAsyncRunning = parsedDetails?.async?.state === 'running' || isActiveCallStatus(call.status);
    const showPanelButton = !isMobile && !isVSCodeRuntime() && (children.length > 0 || progressFallback.length > 0);

    return (
        <div className="mb-2 space-y-1 typography-meta">
            {children.map((child) => {
                const icon = subagentStatusIcon(child.status);
                const displayName = child.name?.trim() || child.role;
                const showRole = Boolean(child.name?.trim() && child.name.trim() !== child.role);
                const liveDetail = child.status === 'running'
                    ? (child.activeTool
                        ? (child.activeToolArgs ? `${child.activeTool}: ${child.activeToolArgs}` : child.activeTool)
                        : (child.stage || child.lastIntent || t('chat.workStatus.subagent.working')))
                    : child.status === 'failed'
                        ? (child.stage || t('chat.workStatus.subagent.failed'))
                        : child.status === 'cancelled'
                            ? (child.stage || t('subagents.status.cancelled'))
                            : child.status === 'completed'
                                ? (child.stage || t('chat.workStatus.subagent.done'))
                                : (child.stage || null);
                return (
                    <div
                        key={child.subagentId}
                        className={cn(
                            'flex items-center gap-2 rounded-lg px-2 py-1 border border-border/20 bg-muted/15 min-w-0',
                            child.childSessionId && 'hover:bg-interactive-hover cursor-pointer',
                        )}
                        onClick={child.childSessionId ? (event) => { event.stopPropagation(); openChild(child); } : undefined}
                    >
                        <Icon
                            name={icon.name}
                            className={cn('size-3.5 shrink-0', !icon.color && 'text-muted-foreground')}
                            style={icon.color ? { color: icon.color } : undefined}
                        />
                        <span className="font-medium text-foreground truncate" dir="auto">{displayName}</span>
                        {showRole ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">({child.role})</span>
                        ) : null}
                        {liveDetail ? (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" dir="auto" title={liveDetail}>
                                {liveDetail}
                            </span>
                        ) : <span className="flex-1" />}
                        {child.childSessionId ? (
                            <OpenSubtaskButton
                                sessionId={child.childSessionId}
                                agent={child.role}
                                label={displayName}
                                directory={directory}
                                isMobile={isMobile}
                            />
                        ) : null}
                    </div>
                );
            })}
            {progressFallback.map((item) => {
                const icon = subagentStatusIcon(item.status);
                const detail = item.currentTool
                    ? (item.currentToolArgs ? `${item.currentTool}: ${item.currentToolArgs}` : item.currentTool)
                    : (item.stage || item.lastIntent || null);
                return (
                    <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 border border-border/20 bg-muted/15 min-w-0"
                    >
                        <Icon
                            name={icon.name}
                            className={cn('size-3.5 shrink-0', !icon.color && 'text-muted-foreground')}
                            style={icon.color ? { color: icon.color } : undefined}
                        />
                        <span className="font-medium text-foreground truncate" dir="auto">{item.id}</span>
                        {item.agent && item.agent !== item.id ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">({item.agent})</span>
                        ) : null}
                        {detail ? (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" dir="auto" title={detail}>
                                {detail}
                            </span>
                        ) : null}
                    </div>
                );
            })}
            {hydrating && children.length === 0 && progressFallback.length === 0 ? (
                <span className="text-muted-foreground">{t('common.loading')}</span>
            ) : null}
            {hydrateFailed ? (
                <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{t('common.unavailable')}</span>
                    <Button variant="ghost" size="xs" onClick={(event) => { event.stopPropagation(); runHydrate(true); }}>
                        {t('errorBoundary.actions.tryAgain')}
                    </Button>
                </div>
            ) : children.length === 0 && progressFallback.length === 0 && !hydrating && isAsyncRunning ? (
                <span className="text-muted-foreground">{t('chat.toolPart.awaitingResponse')}</span>
            ) : null}
            {showPanelButton ? (
                <div className="flex items-center justify-end">
                    <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                            event.stopPropagation();
                            openSubagentsPanel(directory);
                        }}
                    >
                        <Icon name="ai-agent" className="size-3.5" />
                        {t('chat.workStatus.subagent.openPanel')}
                    </Button>
                </div>
            ) : null}
        </div>
    );
};

const TOOL_ROW_TEXT_CLASS = '!text-[length:var(--text-meta)] !leading-5 sm:!leading-6 tracking-normal';
const TOOL_ROW_TITLE_CLASS = cn('typography-meta font-medium', TOOL_ROW_TEXT_CLASS);
const TOOL_ROW_DESCRIPTION_CLASS = cn('typography-meta', TOOL_ROW_TEXT_CLASS);

type ToolJsonViewMode = 'summary' | 'formatted' | 'raw';

const deferredToolBodyMounts: Array<{ active: boolean; fn: () => void }> = [];
let deferredToolBodyFrame: number | undefined;

const flushDeferredToolBodyMounts = () => {
    while (deferredToolBodyMounts.length > 0) {
        const item = deferredToolBodyMounts.pop();
        if (!item) break;
        if (item.active) {
            item.fn();
            deferredToolBodyFrame = deferredToolBodyMounts.length > 0
                ? window.requestAnimationFrame(flushDeferredToolBodyMounts)
                : undefined;
            return;
        }
    }
    deferredToolBodyFrame = undefined;
};

const scheduleDeferredToolBodyMount = (fn: () => void) => {
    const item = { active: true, fn };
    deferredToolBodyMounts.push(item);

    if (deferredToolBodyFrame === undefined) {
        deferredToolBodyFrame = window.requestAnimationFrame(() => {
            deferredToolBodyFrame = window.requestAnimationFrame(flushDeferredToolBodyMounts);
        });
    }

    return () => {
        item.active = false;
    };
};

/**
 * Expansion bodies mount synchronously on the first render (the virtualizer
 * measures their real height), and one frame later for later user clicks so
 * opening a heavy tool never blocks the click itself.
 */
const useDeferredExpandedContent = (isExpanded: boolean) => {
    const [shouldRender, setShouldRender] = React.useState(isExpanded);
    const mountedRef = React.useRef(false);

    React.useEffect(() => {
        if (!isExpanded) {
            mountedRef.current = true;
            setShouldRender(false);
            return;
        }
        if (!mountedRef.current) {
            mountedRef.current = true;
            setShouldRender(true);
            return;
        }
        return scheduleDeferredToolBodyMount(() => setShouldRender(true));
    }, [isExpanded]);

    return shouldRender;
};

const TOOL_COLLAPSED_CUSTOM_STYLE: React.CSSProperties = {
    ...toolDisplayStyles.getCollapsedStyles(),
    padding: 0,
    overflow: 'visible',
};

const CODE_TAG_PROPS = { style: { background: 'transparent', backgroundColor: 'transparent' } };

const TOOL_ERROR_ICON_STYLE: React.CSSProperties = { color: 'var(--status-error)' };
const TOOL_NORMAL_ICON_STYLE: React.CSSProperties = { color: 'var(--tools-icon)' };
const TOOL_ERROR_TITLE_STYLE: React.CSSProperties = { color: 'var(--status-error)' };
const TOOL_NORMAL_TITLE_STYLE: React.CSSProperties = { color: 'var(--tools-title)' };

const renderPathLikeGitChanges = (path: string, grow = true) => {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
        return (
            <span
                className={cn('min-w-0 truncate typography-ui-label text-foreground', grow && 'flex-1')}
                style={{ direction: 'rtl', textAlign: 'left', unicodeBidi: 'plaintext' }}
                title={path}
            >
                {path}
            </span>
        );
    }

    const dir = path.slice(0, lastSlash);
    const name = path.slice(lastSlash + 1);
    const hasAbsoluteRoot = dir.startsWith('/');
    const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir;

    return (
        <span className={cn('min-w-0 flex items-baseline overflow-hidden typography-ui-label', grow && 'flex-1')} title={path}>
            {hasAbsoluteRoot ? <span className="flex-shrink-0 text-muted-foreground">/</span> : null}
            <span className="min-w-0 truncate text-muted-foreground" style={{ direction: 'rtl', textAlign: 'left', unicodeBidi: 'plaintext' }}>
                {displayDir}
            </span>
            <span className="flex-shrink-0">
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{name}</span>
            </span>
        </span>
    );
};

const renderAnimatedPathWithIcon = (path: string, animate = true, grow = true, showFileIcons = true, textClassName = TOOL_ROW_DESCRIPTION_CLASS) => {
    const lastSlash = path.lastIndexOf('/');

    if (lastSlash === -1) {
        return (
            <span className={cn('min-w-0 inline-flex items-center gap-1 overflow-hidden', grow && 'flex-1')} title={path}>
                {showFileIcons ? <FileTypeIcon filePath={path} className="h-3.5 w-3.5 flex-shrink-0" /> : null}
                <Text
                    variant={animate ? 'generate-effect' : 'static'}
                    className={cn('min-w-0 truncate whitespace-nowrap', textClassName, grow && 'flex-1')}
                    style={{ color: 'var(--tools-title)' }}
                >
                    {path}
                </Text>
            </span>
        );
    }

    const dir = path.slice(0, lastSlash);
    const name = path.slice(lastSlash + 1);
    const hasAbsoluteRoot = dir.startsWith('/');
    const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir;

    return (
        <span className={cn('min-w-0 inline-flex items-center gap-1 overflow-hidden', grow && 'flex-1')} title={path}>
            {showFileIcons ? <FileTypeIcon filePath={path} className="h-3.5 w-3.5 flex-shrink-0" /> : null}
            <span className={cn('min-w-0 inline-flex max-w-full items-baseline overflow-hidden', textClassName, grow && 'flex-1')}>
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
        </span>
    );
};

// The rich diff preview is the only tool-card piece that needs the
// @pierre/diffs + Shiki stack; lazy-loading it keeps that stack out of the
// eager chat graph. While the chunk loads, the plain-text patch renders as the
// Suspense fallback, mirroring the preview's own error fallback.
const LazyToolPartDiffPreview = lazyWithChunkRecovery(() => import('./ToolPartDiffPreview'));

const DiffPreview: React.FC<{ diff: string; diffViewMode: DiffViewMode }> = ({ diff, diffViewMode }) => {
    if (isToolDiffPreviewOversized(diff)) return <PlainDiffFallback diff={diff} />;

    return (
        <React.Suspense fallback={<PlainDiffFallback diff={diff} />}>
            <LazyToolPartDiffPreview diff={diff} diffViewMode={diffViewMode} />
        </React.Suspense>
    );
};

interface ToolScrollableSectionProps {
    children: React.ReactNode;
    maxHeightClass?: string;
    className?: string;
    outerClassName?: string;
    disableHorizontal?: boolean;
    followKey?: string;
}

const ToolScrollableSection: React.FC<ToolScrollableSectionProps> = ({
    children,
    maxHeightClass = 'max-h-[60vh]',
    className,
    outerClassName,
    disableHorizontal = false,
    followKey,
}) => {
    const scrollRef = React.useRef<HTMLElement>(null);
    const isFollowingRef = React.useRef(true);
    const lastScrollTopRef = React.useRef(0);

    React.useLayoutEffect(() => {
        const element = scrollRef.current;
        if (followKey === undefined) {
            isFollowingRef.current = true;
            return;
        }
        if (!element || !isFollowingRef.current) return;
        element.scrollTop = element.scrollHeight;
        lastScrollTopRef.current = element.scrollTop;
    }, [followKey]);

    return (
        <div className={cn('w-full min-w-0 flex-none overflow-hidden', outerClassName)}>
            <ScrollShadow
                ref={scrollRef}
                size={24}
                data-scrollable="true"
                onWheelCapture={(event) => {
                    if (followKey !== undefined && event.deltaY < 0) isFollowingRef.current = false;
                }}
                onScroll={(event) => {
                    if (followKey === undefined) return;
                    const element = event.currentTarget;
                    const distanceToEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
                    if (distanceToEnd <= 2) isFollowingRef.current = true;
                    else if (element.scrollTop < lastScrollTopRef.current - 1) isFollowingRef.current = false;
                    lastScrollTopRef.current = element.scrollTop;
                }}
                className={cn(
                    'tool-output-surface p-2 rounded-xl w-full min-w-0',
                    maxHeightClass,
                    disableHorizontal ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto',
                    className,
                )}
            >
                <div className="w-full min-w-0">{children}</div>
            </ScrollShadow>
        </div>
    );
};

const CopyToolOutputButton: React.FC<{ output: string }> = ({ output }) => {
    const { t } = useI18n();
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        setCopied(false);
    }, [output]);

    const handleCopy = React.useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const result = await copyTextToClipboard(output);
        if (!result.ok) {
            toast.error(t('chat.toolPart.copyOutputFailed'));
            return;
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    }, [output, t]);

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md bg-[var(--surface-elevated)]/80 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={copied ? t('chat.toolPart.copiedOutput') : t('chat.toolPart.copyOutput')}
            title={copied ? t('chat.toolPart.copiedOutput') : t('chat.toolPart.copyOutput')}
        >
            <Icon name={copied ? 'check' : 'file-copy'} className="h-3.5 w-3.5" />
        </Button>
    );
};

interface JsonOutputResult {
    data: JsonValue;
    isJson: boolean;
}

interface NativeResultContent {
    text: string;
    images: Array<{ mediaType: string; data: string }>;
    details?: JsonValue;
}

const JsonToolOutput: React.FC<{
    jsonResult: JsonOutputResult;
    renderedOutput: string;
}> = ({ jsonResult, renderedOutput }) => {
    const { t } = useI18n();
    const jsonViewMode = useUIStore((state) => state.toolJsonViewMode);

    const handleJsonViewChange = React.useCallback((view: ToolJsonViewMode, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        useUIStore.getState().setToolJsonViewMode(view);
    }, []);

    // A result that is really text content blocks is shown as the text it is,
    // not as a JSON envelope the reader has to open to read one sentence.
    const textOutput = jsonViewMode === 'summary' ? unwrapTextBlocks(jsonResult.data) : null;

    return (
        <div className="tool-output-surface relative p-2 rounded-xl w-full min-w-0">
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-6 w-6 rounded-md text-muted-foreground hover:text-foreground', jsonViewMode === 'summary' && 'bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]')}
                    onClick={(event) => handleJsonViewChange('summary', event)}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={t('chat.toolPart.showNavigableJson')}
                    title={t('chat.toolPart.showNavigableJson')}
                >
                    <Icon name="list-unordered" className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-6 w-6 rounded-md text-muted-foreground hover:text-foreground', jsonViewMode === 'formatted' && 'bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]')}
                    onClick={(event) => handleJsonViewChange('formatted', event)}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={t('chat.toolPart.showFormattedJson')}
                    title={t('chat.toolPart.showFormattedJson')}
                >
                    <Icon name="node-tree" className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-6 w-6 rounded-md text-muted-foreground hover:text-foreground', jsonViewMode === 'raw' && 'bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]')}
                    onClick={(event) => handleJsonViewChange('raw', event)}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={t('chat.toolPart.showRawJson')}
                    title={t('chat.toolPart.showRawJson')}
                >
                    <Icon name="code-box" className="h-3.5 w-3.5" />
                </Button>
                <CopyToolOutputButton output={renderedOutput} />
            </div>
            {jsonViewMode === 'summary' ? (
                textOutput !== null ? (
                    <div className="typography-code pr-12 text-muted-foreground/90">
                        <HighlightedCode
                            language="text"
                            code={textOutput}
                            style={TOOL_COLLAPSED_CUSTOM_STYLE}
                            codeStyle={CODE_TAG_PROPS.style}
                            wrap
                        />
                    </div>
                ) : (
                    <JsonSummaryView data={jsonResult.data} />
                )
            ) : jsonViewMode === 'formatted' ? (
                <JsonTreeViewer data={jsonResult.data} initiallyExpandedDepth={1} maxHeight="400px" />
            ) : (
                <div className="typography-code pr-12 text-muted-foreground/90">
                    <HighlightedCode
                        language="json"
                        code={renderedOutput}
                        style={TOOL_COLLAPSED_CUSTOM_STYLE}
                        codeStyle={CODE_TAG_PROPS.style}
                        wrap
                    />
                </div>
            )}
        </div>
    );
};

const ToolScrollableTextOutput: React.FC<{
    output: string;
    toolName: string;
    input: ToolCallPart['input'] | undefined;
    presentation?: GuestToolRule | null;
    onShowPopup?: (content: ToolPopupContent) => void;
}> = ({ output, toolName, input, presentation = null, onShowPopup }) => {
    const renderedOutput = React.useMemo(() => {
        const capped = capToolOutputText(output);
        return isShellTool(toolName) ? renderTerminalOutput(capped) : capped;
    }, [output, toolName]);
    const jsonResult = React.useMemo(() => tryParseJsonOutput(renderedOutput), [renderedOutput]);
    const outputLanguage = isShellTool(toolName) ? 'bash' : detectToolOutputLanguage(toolName, renderedOutput, input);
    const forcedMode = presentation?.output && presentation.output !== 'auto' ? presentation.output : null;

    if (forcedMode === 'markdown') {
        return (
            <div className="w-full min-w-0">
                <SimpleMarkdownRenderer content={renderedOutput} variant="tool" onShowPopup={onShowPopup} />
            </div>
        );
    }

    if (forcedMode === 'table' && presentation?.columns?.length) {
        const rows = guestToolTableRows(renderedOutput);
        if (rows) return <GuestToolTable rows={rows} columns={presentation.columns} />;
    }

    if (forcedMode === 'card' && presentation && jsonResult.isJson) {
        const card = resolveGuestToolCard(presentation, jsonResult.data);
        if (card) return <GuestToolCard result={card} />;
    }

    if (forcedMode === 'text' || forcedMode === 'code') {
        return (
            <HighlightedCode
                language={forcedMode === 'code' && presentation?.language ? presentation.language : 'text'}
                code={renderedOutput}
                style={TOOL_COLLAPSED_CUSTOM_STYLE}
                codeStyle={CODE_TAG_PROPS.style}
                wrap
            />
        );
    }

    if (jsonResult.isJson) {
        return <JsonToolOutput jsonResult={jsonResult} renderedOutput={renderedOutput} />;
    }

    if (isShellTool(toolName)) {
        return (
            <div className="relative typography-code text-muted-foreground/90">
                <div className="absolute right-1 top-1 z-10">
                    <CopyToolOutputButton output={renderedOutput} />
                </div>
                <div className="pr-8">
                    <HighlightedCode
                        language={outputLanguage}
                        code={renderedOutput}
                        style={TOOL_COLLAPSED_CUSTOM_STYLE}
                        codeStyle={CODE_TAG_PROPS.style}
                        wrap
                    />
                </div>
            </div>
        );
    }

    return (
        <div>
            <HighlightedCode
                language={outputLanguage}
                code={renderedOutput}
                style={TOOL_COLLAPSED_CUSTOM_STYLE}
                codeStyle={CODE_TAG_PROPS.style}
                wrap
            />
        </div>
    );
};

interface ToolExpandedContentProps {
    part: ToolCallPart | ToolResultPart;
    call: ToolCallPart | undefined;
    sessionId: string | undefined;
    isMobile: boolean;
    currentDirectory: string;
    isExpanded: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
    presentation: GuestToolRule | null;
    resultContent: NativeResultContent;
    fileChanges: ToolFileChange[];
    toolName: string;
    hasStructuredSubagentRows?: boolean;
}

const ToolExpandedContent: React.FC<ToolExpandedContentProps> = React.memo(({
    part,
    call,
    sessionId,
    isMobile,
    currentDirectory,
    isExpanded,
    onShowPopup,
    presentation,
    resultContent,
    fileChanges,
    toolName,
    hasStructuredSubagentRows = false,
}) => {
    const { t } = useI18n();
    const runtime = React.useContext(RuntimeAPIContext);
    const mobileActions = useMobileAppActions();
    const [diffViewMode, setDiffViewMode] = React.useState<DiffViewMode>('unified');
    const input = call?.input;
    const rawOutput = resultContent.text;
    const hasStringOutput = rawOutput.length > 0;
    const outputString = rawOutput;
    // OpenChamber's own tools answer an envelope the chat can show in its own
    // terms; the plain answer stays one click away.
    const openChamberEnvelope = React.useMemo(
        () => (part.type === 'tool_result' ? parseOpenChamberEnvelope(rawOutput) : null),
        [part.type, rawOutput],
    );
    const [showRawToolAnswer, setShowRawToolAnswer] = React.useState(false);

    React.useEffect(() => {
        setDiffViewMode('unified');
    }, [part.partId]);

    const hideToolInputPreview = (isEditTool(toolName) || toolBaseName(toolName) === 'apply_patch') && fileChanges.length > 0;
    const isWrite = isWriteTool(toolName);
    const writeInput = isWrite ? writeInputSchema.safeParse(input).data : undefined;
    const writeContent = writeInput?.content;
    const writePath = writeInput?.path;

    const suppressRawInput = isRawInputSuppressedTool(toolName);
    const scalarInputRows = React.useMemo(() => {
        if (!input || Object.keys(input).length === 0) return null;
        if (isWrite || isShellTool(toolName) || isEvalTool(toolName) || isEditTool(toolName) || toolBaseName(toolName) === 'apply_patch' || isQuestionTool(toolName) || suppressRawInput) {
            return null;
        }
        return flatScalarInputRows(input);
    }, [input, isWrite, suppressRawInput, toolName]);
    const inputTextContent = React.useMemo(() => {
        if (!input || Object.keys(input).length === 0) return '';
        if (isWrite || suppressRawInput || scalarInputRows !== null) return '';
        return formatToolInput(input, toolName);
    }, [input, isWrite, scalarInputRows, suppressRawInput, toolName]);
    const hasInputText = !hideToolInputPreview && !writeContent && inputTextContent.trim().length > 0;
    const hasScalarInputRows = !hideToolInputPreview && !writeContent && scalarInputRows !== null && scalarInputRows.length > 0;

    const webSearchOutput = React.useMemo(
        () => (isWebSearchTool(toolName) && part.type === 'tool_result' && !part.isError && hasStringOutput
            ? renderWebSearchOutput(part.output, { unstyled: true })
            : null),
        [hasStringOutput, part, toolName],
    );

    const renderScrollableBlock = (
        content: React.ReactNode,
        options?: { maxHeightClass?: string; className?: string; disableHorizontal?: boolean; outerClassName?: string; followKey?: string }
    ) => (
        <ToolScrollableSection
            maxHeightClass={options?.maxHeightClass}
            className={options?.className}
            disableHorizontal={options?.disableHorizontal}
            outerClassName={options?.outerClassName}
            followKey={options?.followKey}
        >
            {content}
        </ToolScrollableSection>
    );

    const openEntryFile = (entry: ToolFileChange, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const line = entry.diff ? extractFirstChangedLineFromDiff(entry.diff) : undefined;
        const absolutePath = toAbsoluteFilePath(currentDirectory, entry.path);
        if (runtime?.editor) {
            void runtime.editor.openFile(absolutePath, line);
            return;
        }
        const uiStore = useUIStore.getState();
        if (line !== undefined && Number.isFinite(line)) {
            uiStore.openContextFileAtLine(currentDirectory, absolutePath, Math.max(1, Math.trunc(line)), 1);
        } else {
            uiStore.openContextFile(currentDirectory, absolutePath);
        }
        mobileActions?.openFiles();
    };
    const openEntryDiff = (entry: ToolFileChange, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const line = entry.diff ? extractFirstChangedLineFromDiff(entry.diff) : undefined;
        const absolutePath = toAbsoluteFilePath(currentDirectory, entry.path);
        const relativePath = getRelativeFilePath(entry.path, currentDirectory);
        if (runtime?.editor) {
            void runtime.editor.openDiff('', absolutePath, `${relativePath} (changes)`, { line, patch: entry.diff });
            return;
        }
        const store = useUIStore.getState();
        if (store.isMobile) {
            store.navigateToDiff(relativePath);
            return;
        }
        store.openContextDiff(currentDirectory, relativePath);
    };

    const renderQuestionContent = () => {
        if (part.type === 'tool_result' && !part.isError) {
            const parsedQA = askAnswers(resultContent.details);
            const askTimedOut = z.looseObject({ timedOut: z.literal(true) }).safeParse(resultContent.details).success;
            if (parsedQA.length > 0 || askTimedOut) {
                return renderScrollableBlock(
                    <div className="space-y-2">
                        {askTimedOut ? (
                            <div
                                data-testid="ask-timed-out-notice"
                                className="typography-micro inline-flex items-center gap-1 rounded px-1.5 py-0.5 border"
                                style={{
                                    color: 'var(--status-warning)',
                                    backgroundColor: 'var(--status-warning-background)',
                                    borderColor: 'var(--status-warning-border)',
                                }}
                            >
                                <Icon name="time" className="size-3" />
                                <span>{t('chat.toolPart.askTimedOut')}</span>
                            </div>
                        ) : null}
                        {parsedQA.map((qa, index) => (
                            <div key={index} className="space-y-0.5">
                                <FormMarkdown content={qa.question} size="micro" className="text-muted-foreground" />
                                <div className={cn('typography-meta whitespace-pre-wrap', qa.answer ? 'text-foreground' : 'text-muted-foreground/70 italic')}>
                                    {qa.answer || t('chat.toolPart.noAnswer')}
                                </div>
                                {qa.note ? (
                                    <div className="typography-micro text-muted-foreground/80 whitespace-pre-wrap">
                                        {qa.note}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>,
                    { maxHeightClass: 'max-h-[40vh]' }
                );
            }
        }

        const questionInput = askInputSchema.safeParse(input).data;
        if (questionInput && questionInput.questions.length > 0) {
            return renderScrollableBlock(
                <div className="space-y-2">
                    {questionInput.questions.map((q, index) => (
                        <div key={index} className="space-y-0.5">
                            {q.header ? <div className="typography-micro text-muted-foreground">{coerceToText(q.header)}</div> : null}
                            <FormMarkdown content={coerceToText(q.question)} size="meta" className="text-foreground" />
                            {q.options.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {q.options.map((opt) => (
                                        <span key={coerceToText(opt.label)} className="typography-micro px-1.5 py-0.5 rounded bg-muted/30 border border-border/30 text-muted-foreground">
                                            {coerceToText(opt.label)}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>,
                { maxHeightClass: 'max-h-[40vh]' }
            );
        }

        return <div className="typography-meta text-muted-foreground">{t('chat.toolPart.awaitingResponse')}</div>;
    };

    const renderFileChanges = () => (
        <div className="space-y-3">
            {fileChanges.map((entry) => (
                <div key={`${entry.path}:${entry.op ?? 'change'}`} className="w-full min-w-0">
                    <div className="mb-1 flex min-w-0 items-center gap-1 px-2 py-1">
                        <div className="min-w-0 flex-1 typography-meta font-medium text-muted-foreground">
                            {renderPathLikeGitChanges(getRelativeFilePath(entry.path, currentDirectory))}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={(event) => openEntryFile(entry, event)}
                            aria-label={t('chat.toolPart.openFileAtFirstChange')}
                            title={t('chat.toolPart.openFileAtFirstChange')}
                        >
                            <Icon name="file-edit" className="h-3.5 w-3.5" />
                        </Button>
                        {entry.diff ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={(event) => openEntryDiff(entry, event)}
                                aria-label={t('chat.toolPart.openFileDiff')}
                                title={t('chat.toolPart.openFileDiff')}
                            >
                                <Icon name="git-pull-request" className="h-3.5 w-3.5" />
                            </Button>
                        ) : null}
                        {entry.diff && onShowPopup ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onShowPopup({
                                        open: true,
                                        title: getRelativeFilePath(entry.path, currentDirectory),
                                        content: capToolOutputText(entry.diff ?? ''),
                                        language: 'diff',
                                        isDiff: true,
                                        toolName,
                                        input: call?.input,
                                    });
                                }}
                                aria-label={getRelativeFilePath(entry.path, currentDirectory)}
                            >
                                <Icon name="external-link" className="h-3.5 w-3.5" />
                            </Button>
                        ) : null}
                    </div>
                    {entry.diff ? <DiffPreview diff={entry.diff} diffViewMode={diffViewMode} /> : null}
                </div>
            ))}
        </div>
    );

    const renderResultContent = () => {
        if (presentation?.output && presentation.output !== 'auto' && hasStringOutput && outputString.trim()) {
            return renderScrollableBlock(
                <ToolScrollableTextOutput
                    output={outputString}
                    toolName={toolName}
                    input={input}
                    presentation={presentation}
                    onShowPopup={onShowPopup}
                />,
                { className: 'p-1' }
            );
        }

        if (isQuestionTool(toolName)) return renderQuestionContent();

        if (isSubagentTool(toolName) && hasStringOutput) {
            const taskBody = hasStructuredSubagentRows
                ? stripTaskSpawnBoilerplate(outputString)
                : outputString;
            if (!taskBody.trim()) return null;
            return renderScrollableBlock(
                <div className="w-full min-w-0">
                    <SimpleMarkdownRenderer content={taskBody} variant="tool" onShowPopup={onShowPopup} />
                </div>
            );
        }

        if (fileChanges.length > 0) {
            return renderScrollableBlock(renderFileChanges(), { className: 'p-1' });
        }

        if (webSearchOutput) {
            return renderScrollableBlock(webSearchOutput, { className: 'p-1', maxHeightClass: 'max-h-[50vh]' });
        }
        if (isFindTool(toolName) && hasStringOutput && outputString.trim()) {
            const lines = outputString.split('\n');
            const openFindTarget = (rawPath: string, line?: number) => {
                const normalized = normalizeWorkspaceToolPath(rawPath);
                const abs = toAbsoluteFilePath(currentDirectory, normalized);
                if (runtime?.editor) {
                    void runtime.editor.openFile(abs, line);
                    return;
                }
                const uiStore = useUIStore.getState();
                if (line !== undefined && Number.isFinite(line)) {
                    uiStore.openContextFileAtLine(currentDirectory, abs, Math.max(1, Math.trunc(line)), 1);
                } else {
                    uiStore.openContextFile(currentDirectory, abs);
                }
                mobileActions?.openFiles();
            };
            const parsedLines = parseFindLines(lines);
            const findOutput = (
                <div className="space-y-1 font-mono text-xs">
                    {parsedLines.map((parsed, idx) => {
                        if (parsed.kind === 'hit') {
                            const displayPath = normalizeWorkspaceToolPath(parsed.filePath);
                            return (
                                <div key={idx} className="flex items-start gap-1.5 py-0.5 pl-2">
                                    {parsed.score !== undefined ? (
                                        <span
                                            data-testid="find-score-badge"
                                            className="inline-flex items-center px-1 py-0 rounded border text-[10px] leading-4 font-medium shrink-0"
                                            style={findScoreBadgeStyle(parsed.score)}
                                        >
                                            {parsed.score.toFixed(2)}
                                        </span>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="text-primary hover:underline font-medium shrink-0 cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openFindTarget(parsed.filePath, parsed.startLine);
                                        }}
                                    >
                                        {displayPath}:{parsed.startLine}{parsed.endLine ? `-${parsed.endLine}` : ''}
                                    </button>
                                    {parsed.snippet ? (
                                        <span className="text-muted-foreground truncate">{parsed.snippet}</span>
                                    ) : null}
                                </div>
                            );
                        }
                        if (parsed.kind === 'header') {
                            const displayPath = normalizeWorkspaceToolPath(parsed.filePath);
                            return (
                                <div key={idx} className="flex items-center gap-1.5 pt-1 pb-0.5">
                                    <button
                                        type="button"
                                        className="text-foreground hover:text-primary hover:underline font-medium shrink-0 cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openFindTarget(parsed.filePath);
                                        }}
                                    >
                                        {displayPath}
                                    </button>
                                    <span
                                        data-testid="find-score-badge"
                                        className="inline-flex items-center px-1 py-0 rounded border text-[10px] leading-4 font-medium shrink-0"
                                        style={findScoreBadgeStyle(parsed.score)}
                                    >
                                        {parsed.score.toFixed(2)}
                                    </span>
                                    <span className="text-muted-foreground/80 truncate">{parsed.meta}</span>
                                </div>
                            );
                        }
                        return <div key={idx} className="text-muted-foreground whitespace-pre-wrap">{parsed.text}</div>;
                    })}
                </div>
            );
            return renderScrollableBlock(findOutput, { className: 'p-1', maxHeightClass: 'max-h-[50vh]' });
        }

        if (openChamberEnvelope && !showRawToolAnswer && sessionId && call && part.type === 'tool_result' && hasOpenChamberView(openChamberEnvelope)) {
            const rawToggle = (
                <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground hover:text-foreground"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); setShowRawToolAnswer(true); }}
                >
                    <Icon name="code-box" className="size-3.5" />
                    {t('chat.toolPart.openchamber.raw.show')}
                </Button>
            );
            return renderScrollableBlock(
                <div className="space-y-2">
                    <OpenChamberToolOutput
                        envelope={openChamberEnvelope}
                        part={toToolView(call, part, { sessionID: sessionId, messageID: part.partId })}
                        input={input}
                        directory={currentDirectory}
                        isMobile={isMobile}
                        onShowPopup={onShowPopup}
                        rawToggle={rawToggle}
                    />
                </div>,
                { className: 'p-1' },
            );
        }

        if (openChamberEnvelope && !showRawToolAnswer && !openChamberEnvelope.ok && openChamberEnvelope.errorMessage) {
            return renderScrollableBlock(
                <div className="typography-meta whitespace-pre-wrap break-words" style={{ color: 'var(--status-error)' }}>
                    {openChamberEnvelope.errorMessage}
                </div>,
                { className: 'p-1' },
            );
        }

        if (hasStringOutput && outputString.trim()) {
            const output = (
                <ToolScrollableTextOutput
                    output={outputString}
                    toolName={toolName}
                    input={input}
                />
            );
            return renderScrollableBlock(output, {
                className: isShellTool(toolName) ? 'p-1 rounded-none' : 'p-1',
                maxHeightClass: isShellTool(toolName) ? 'max-h-[46vh]' : undefined,
            });
        }

        if (part.type === 'tool_result' && resultContent.images.length > 0) return null;

        return renderScrollableBlock(
            <div className="typography-meta text-muted-foreground/70">{t('chat.toolPart.noOutputProduced')}</div>,
            { maxHeightClass: 'max-h-60' }
        );
    };

    const hasVisibleOutput = isSubagentTool(toolName) && hasStructuredSubagentRows
        ? stripTaskSpawnBoilerplate(outputString).trim().length > 0
        : outputString.trim().length > 0;
    const shouldRenderResult = isSubagentTool(toolName) && hasStructuredSubagentRows
        ? (hasVisibleOutput || fileChanges.length > 0)
        : (part.type === 'tool_result' || (isShellTool(toolName) && hasVisibleOutput) || fileChanges.length > 0);
    const hasVisualDiffEntry = fileChanges.some((entry) => !!entry.diff);
    const bashStatus = React.useMemo(() => {
        if (!isShellTool(toolName)) return null;
        const parsed = bashStatusDetailsSchema.safeParse(resultContent.details);
        if (!parsed.success) return null;
        if (!parsed.data.async && !parsed.data.service) return null;
        return parsed.data;
    }, [resultContent.details, toolName]);
    const hasExpandedBody = hasInputText
        || hasScalarInputRows
        || Boolean(writeContent && !hasVisualDiffEntry)
        || shouldRenderResult
        || resultContent.images.length > 0
        || (part.type === 'tool_result' && Boolean(part.error))
        || Boolean(bashStatus);

    const openImagePreview = (index: number) => {
        if (!onShowPopup) return;
        const images = resultContent.images;
        const gallery = images.map((image, imageIndex) => ({
            url: `data:${image.mediaType};base64,${image.data}`,
            mimeType: image.mediaType,
            filename: `${toolName} output ${imageIndex + 1}`,
        }));
        onShowPopup({
            open: true,
            title: `${toolName} output`,
            content: '',
            image: { ...gallery[index], gallery, index },
        });
    };

    return (
        <div className="relative pr-2 pb-2 pt-2 space-y-2 pl-4">
            {isEvalTool(toolName) ? (
                <EvalPresenter
                    call={call}
                    result={part.type === 'tool_result' ? part : undefined}
                    onShowPopup={onShowPopup}
                />
            ) : isQuestionTool(toolName) ? (
                renderResultContent()
            ) : Object.hasOwn(VIBE_TOOL_NAMES, toolBaseName(toolName)) ? (
                <>
                    <VibeToolCard
                        toolName={toolName}
                        toolCallId={call?.toolCallId ?? part.toolCallId}
                        input={input}
                        details={resultContent.details}
                        outputText={outputString}
                        sessionId={sessionId}
                        directory={currentDirectory}
                        isMobile={isMobile}
                        isError={part.type === 'tool_result' ? part.isError : false}
                    />
                    {part.type === 'tool_result' && part.error && part.error !== outputString.trim() ? (
                        <div>
                            <div className="typography-meta font-medium text-muted-foreground/80 mb-1">{t('chat.toolPart.error')}</div>
                            <div className="typography-meta p-2 rounded-xl border" style={{
                                backgroundColor: 'var(--status-error-background)',
                                color: 'var(--status-error)',
                                borderColor: 'var(--status-error-border)',
                            }}>
                                {part.error}
                            </div>
                        </div>
                    ) : null}
                </>
            ) : Object.hasOwn(WAIT_TOOL_NAMES, toolBaseName(toolName)) ? (
                <>
                    {resultContent.details !== undefined || outputString.trim().length > 0 ? (
                        <WaitToolCard
                            details={resultContent.details}
                            outputText={outputString}
                            isError={part.type === 'tool_result' ? part.isError : false}
                        />
                    ) : (
                        <div className="typography-meta text-muted-foreground/70">{t('chat.toolPart.awaitingResponse')}</div>
                    )}
                    {part.type === 'tool_result' && part.error && part.error !== outputString.trim() ? (
                        <div>
                            <div className="typography-meta font-medium text-muted-foreground/80 mb-1">{t('chat.toolPart.error')}</div>
                            <div className="typography-meta p-2 rounded-xl border" style={{
                                backgroundColor: 'var(--status-error-background)',
                                color: 'var(--status-error)',
                                borderColor: 'var(--status-error-border)',
                            }}>
                                {part.error}
                            </div>
                        </div>
                    ) : null}
                </>
            ) : isStructuredCardTool(toolName) ? (
                <>
                    <StructuredToolCard
                        toolName={toolName}
                        input={input}
                        details={resultContent.details}
                        output={outputString}
                        onShowPopup={onShowPopup}
                    />
                    {part.type === 'tool_result' && part.error && part.error !== outputString.trim() ? (
                        <div>
                            <div className="typography-meta font-medium text-muted-foreground/80 mb-1">{t('chat.toolPart.error')}</div>
                            <div className="typography-meta p-2 rounded-xl border" style={{
                                backgroundColor: 'var(--status-error-background)',
                                color: 'var(--status-error)',
                                borderColor: 'var(--status-error-border)',
                            }}>
                                {part.error}
                            </div>
                        </div>
                    ) : null}
                </>
            ) : (
                <>
                    {hasScalarInputRows && scalarInputRows ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <dl data-testid="tool-input-kv-rows" className="space-y-1">
                                    {scalarInputRows.map((row) => (
                                        <div key={row.key} className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] items-baseline gap-x-3 typography-meta">
                                            <dt dir="auto" className="truncate font-mono typography-micro text-muted-foreground">{row.key}</dt>
                                            <dd dir="auto" className="min-w-0 whitespace-pre-wrap break-words text-foreground">{row.value}</dd>
                                        </div>
                                    ))}
                                </dl>,
                                {
                                    maxHeightClass: 'max-h-60',
                                    className: 'tool-input-surface',
                                }
                            )}
                        </div>
                    ) : hasInputText ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                isShellTool(toolName) ? (
                                    <pre className="tool-input-text whitespace-pre-wrap break-words typography-code text-muted-foreground/90 m-0 p-0">
                                        {inputTextContent}
                                    </pre>
                                ) : (
                                    <blockquote className="tool-input-text whitespace-pre-wrap break-words typography-meta italic text-muted-foreground/70">
                                        {inputTextContent}
                                    </blockquote>
                                ),
                                {
                                    maxHeightClass: 'max-h-60',
                                    className: isShellTool(toolName) ? 'tool-input-surface p-0 rounded-none' : 'tool-input-surface',
                                }
                            )}
                        </div>
                    ) : null}
                    {writeContent && !hasVisualDiffEntry ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <WritePreview content={writeContent} filePath={writePath} />,
                                { maxHeightClass: isExpanded ? 'max-h-[50vh]' : 'max-h-60', className: 'tool-input-surface' }
                            )}
                        </div>
                    ) : null}

                    {shouldRenderResult && (
                        <div>
                            {hasVisualDiffEntry ? (
                                <div className="mb-1 flex items-center justify-end gap-2">
                                    <DiffViewToggle mode={diffViewMode} onModeChange={setDiffViewMode} className="h-5 w-5 p-0" />
                                </div>
                            ) : null}
                            {renderResultContent()}
                        </div>
                    )}

                    {resultContent.images.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {resultContent.images.map((image, index) => {
                                const url = `data:${image.mediaType};base64,${image.data}`;
                                return onShowPopup ? (
                                    <button
                                        key={index}
                                        type="button"
                                        className="rounded-lg border border-border/30 bg-muted/10 p-0.5"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openImagePreview(index);
                                        }}
                                        aria-label={`${t('chat.toolPart.output')} ${index + 1}`}
                                    >
                                        <img src={url} alt={`${t('chat.toolPart.output')} ${index + 1}`} className="max-h-[40vh] max-w-full object-contain" loading="lazy" />
                                    </button>
                                ) : (
                                    <img key={index} src={url} alt={`${t('chat.toolPart.output')} ${index + 1}`} className="max-h-[40vh] max-w-full object-contain" loading="lazy" />
                                );
                            })}
                        </div>
                    ) : null}

                    {part.type === 'tool_result' && part.error ? (
                        <div>
                            <div className="typography-meta font-medium text-muted-foreground/80 mb-1">{t('chat.toolPart.error')}</div>
                            <div className="typography-meta p-2 rounded-xl border" style={{
                                backgroundColor: 'var(--status-error-background)',
                                color: 'var(--status-error)',
                                borderColor: 'var(--status-error-border)',
                            }}>
                                {part.error}
                            </div>
                        </div>
                    ) : null}
                    {bashStatus ? (
                        <div data-testid="bash-status-footer" className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground/80">
                            {bashStatus.async ? (
                                <div
                                    data-testid="bash-async-badge"
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px]"
                                >
                                    <Icon name="history" className="size-3" />
                                    <span>
                                        {t('chat.eval.backgroundJob', { id: bashStatus.async.jobId })} · {bashStatus.async.state}
                                    </span>
                                </div>
                            ) : null}
                            {bashStatus.service ? (() => {
                                const service = bashStatus.service;
                                const readyLabel = service.ready === true
                                    ? t('chat.toolPart.bashServiceReady')
                                    : service.timedOut === true
                                        ? t('chat.toolPart.bashServiceTimedOut')
                                        : t('chat.toolPart.bashServiceNotReady');
                                return (
                                    <div
                                        data-testid="bash-service-badge"
                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px]"
                                    >
                                        <Icon name="terminal-box" className="size-3" />
                                        <span>
                                            {t('chat.toolPart.bashService', { name: service.name })} · {readyLabel}
                                            {service.pid !== undefined ? ` · ${t('chat.toolPart.bashServicePid', { pid: service.pid })}` : ''}
                                        </span>
                                    </div>
                                );
                            })() : null}
                        </div>
                    ) : null}
                    {!hasExpandedBody ? (
                        <div className="typography-meta text-muted-foreground/70">{t('chat.toolPart.awaitingResponse')}</div>
                    ) : null}
                </>
            )}
        </div>
    );
});

ToolExpandedContent.displayName = 'ToolExpandedContent';

interface ToolPartProps {
    part: ToolCallPart | ToolResultPart;
    pairedCall?: ToolCallPart;
    sessionId?: string;
    directory?: string | null;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    isMobile: boolean;
    alwaysShowActions?: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
    animateTailText?: boolean;
}

interface ToolPartErrorBoundaryProps {
    children: React.ReactNode;
    displayName: string;
    errorLabel: string;
    resetKey: unknown;
    toolName: string;
}

interface ToolPartErrorState {
    hasError: boolean;
    error?: Error;
}

class ToolPartErrorBoundary extends React.Component<ToolPartErrorBoundaryProps, ToolPartErrorState> {
    state: ToolPartErrorState = { hasError: false };

    static getDerivedStateFromError(error: Error): ToolPartErrorState {
        return { hasError: true, error };
    }

    componentDidUpdate(prevProps: { resetKey: unknown }) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, error: undefined });
        }
    }

    componentDidCatch(error: Error) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('Tool part failed to render; showing safe fallback.', error);
        }
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        const message = this.state.error?.message;
        return (
            <div className="flex items-center gap-1.5 pr-2 pl-px py-1.5 rounded-xl min-w-0">
                <div className="h-3.5 w-3.5 flex-shrink-0" style={TOOL_ERROR_ICON_STYLE}>
                    {getToolIcon(this.props.toolName)}
                </div>
                <span className={cn(TOOL_ROW_TITLE_CLASS, 'flex-shrink-0')} style={TOOL_ERROR_TITLE_STYLE}>
                    {this.props.displayName}
                </span>
                {message ? (
                    <span className={cn(TOOL_ROW_DESCRIPTION_CLASS, 'min-w-0 truncate')} style={{ color: 'var(--tools-description)' }} title={message}>
                        {this.props.errorLabel}: {message}
                    </span>
                ) : null}
            </div>
        );
    }
}

/** Canonical calls and results are separate content parts, not mutable tool states. */
const ToolPart: React.FC<ToolPartProps> = ({
    part,
    pairedCall,
    sessionId,
    directory,
    isExpanded,
    onToggle,
    isMobile,
    onShowPopup,
    animateTailText = true,
}) => {
    const { t } = useI18n();
    const rowRef = React.useRef<HTMLDivElement>(null);
    const runtime = React.useContext(RuntimeAPIContext);
    const mobileActions = useMobileAppActions();
    const selection = useChatSessionSelection();
    const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);
    const currentDirectory = directory ?? selection.directory ?? fallbackDirectory ?? '';
    const showToolFileIcons = useUIStore((s) => s.showToolFileIcons);
    const toolName = normalizeToolName(part.toolName) || 'tool';
    const call = part.type === 'tool_call' ? part
        : pairedCall?.toolCallId === part.toolCallId && pairedCall.toolName === part.toolName ? pairedCall : undefined;
    const result = part.type === 'tool_result' ? part : undefined;
    const presentation = useGuestToolPresentation(part.toolName);
    const rawResultContent = React.useMemo(() => nativeToolResultContent(result), [result]);
    const resultContent = React.useMemo(() => {
        if (!result || result.isError || !Object.hasOwn(DISPLAY_CONTENT_TOOL_NAMES, toolBaseName(toolName))) return rawResultContent;
        const preferred = preferredDisplayContent(rawResultContent.details, rawResultContent.text);
        return preferred === rawResultContent.text ? rawResultContent : { ...rawResultContent, text: preferred };
    }, [rawResultContent, result, toolName]);
    const toolRow = toolPresentation(toolName, resultContent.details);
    const displayName = toolRow.label;
    const fileChanges = React.useMemo(() => getToolFileChanges(part, call), [part, call]);
    const diffs = React.useMemo(() => getToolDiffs(part, call), [part, call]);
    const guestHeader = React.useMemo(() => presentation ? renderGuestToolHeader(presentation, {
        input: call?.input,
        output: result ? resultContent.text : undefined,
        metadata: undefined,
    }) : null, [call?.input, presentation, result, resultContent.text]);

    // The registry knows how every OMP tool names its target. A call with
    // several files, or several questions, describes the count instead.
    const described = React.useMemo<{ text: string; path: string | null }>(() => {
        if (!call) return { text: '', path: null };
        const paths = toolInputPaths(call);
        if (paths.length > 1) return { text: t('chat.toolPart.filesCount', { count: paths.length }), path: null };
        const filePath = isReadTool(toolName) || isEditTool(toolName) || isWriteTool(toolName) || isAstEditTool(toolName) || toolBaseName(toolName) === 'apply_patch'
            ? (toolInputPath(call.input) ?? (paths.length === 1 ? paths[0]! : null))
            : null;
        if (filePath) {
            const target = normalizeWorkspaceToolPath(isReadTool(toolName) ? parseNativeReadPath(filePath).path : filePath);
            const display = getRelativeFilePath(target, currentDirectory);
            return { text: display || describeToolCall(call.input, toolName) || '', path: display ? target : null };
        }
        if (isQuestionTool(toolName) && Array.isArray(call.input.questions) && call.input.questions.length > 1) {
            return { text: t('chat.toolPart.questionsAsked', { count: call.input.questions.length }), path: null };
        }
        return { text: describeToolCall(call.input, toolName) ?? '', path: null };
    }, [call, currentDirectory, t, toolName]);
    const isSubagent = isSubagentTool(toolName);
    const isVibeSpawn = isVibeSubagentTool(toolName);
    const taskSessionId = sessionId ?? selection.sessionId;
    const taskToolCallId = call?.toolCallId ?? part.toolCallId;
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    const vibeSpawnWorkerId = React.useMemo(() => {
        if (!isVibeSpawn) return '';
        const fromDetails = vibeSpawnDetailsSchema.safeParse(resultContent.details).data?.spawned?.id;
        if (fromDetails) return fromDetails;
        return vibeSpawnInputSchema.safeParse(call?.input).data?.name ?? '';
    }, [call?.input, isVibeSpawn, resultContent.details]);
    const vibeSubtaskKey = useSubagentsStore(
        React.useCallback(
            (state) => (isVibeSpawn && taskSessionId
                ? serializeVibeSpawnSubagent(state.byParent[taskSessionId], taskSessionId, taskToolCallId, vibeSpawnWorkerId)
                : ''),
            [isVibeSpawn, taskSessionId, taskToolCallId, vibeSpawnWorkerId],
        ),
    );
    const vibeSubtask = React.useMemo(() => {
        if (!vibeSubtaskKey) return null;
        const [childSessionId = '', role = '', label = ''] = vibeSubtaskKey.split('\u0000');
        if (!childSessionId) return null;
        return { childSessionId, role: role || 'subagent', label: label || role || 'subagent' };
    }, [vibeSubtaskKey]);
    const parsedTaskDetails = React.useMemo(
        () => (isSubagent ? taskResultDetailsSchema.safeParse(resultContent.details).data : undefined),
        [isSubagent, resultContent.details],
    );
    const storeSubagentKey = useSubagentsStore(
        React.useCallback(
            (state) => (isSubagent && taskSessionId && taskToolCallId
                ? serializeTaskSubagentStatuses(state.byParent[taskSessionId], taskSessionId, taskToolCallId)
                : ''),
            [isSubagent, taskSessionId, taskToolCallId],
        ),
    );
    const storeSubagentStatuses = React.useMemo(
        () => parseTaskSubagentStatuses(storeSubagentKey),
        [storeSubagentKey],
    );
    const expectedTaskNames = React.useMemo(() => {
        if (!isSubagent || !call) return EMPTY_STRING_ARRAY;
        const parsedInput = taskCallExpectedIdsSchema.safeParse(call.input).data;
        if (!parsedInput) return EMPTY_STRING_ARRAY;
        if (parsedInput.tasks && parsedInput.tasks.length > 0) {
            return parsedInput.tasks.map((item) => item.name).filter((name): name is string => Boolean(name));
        }
        return parsedInput.name ? [parsedInput.name] : EMPTY_STRING_ARRAY;
    }, [call, isSubagent]);
    const targetReportIds = React.useMemo(() => {
        if (!isSubagent || !parsedTaskDetails?.async) return EMPTY_STRING_ARRAY;
        const ids = new Set<string>();
        for (const item of parsedTaskDetails.progress ?? []) {
            if (item.id) ids.add(item.id);
        }
        if (parsedTaskDetails.async.jobId) ids.add(parsedTaskDetails.async.jobId);
        for (const id of expectedTaskNames) ids.add(id);
        return ids.size > 0 ? [...ids] : EMPTY_STRING_ARRAY;
    }, [expectedTaskNames, isSubagent, parsedTaskDetails]);
    const shouldReadReportStatuses = Boolean(
        isSubagent
        && result
        && !result.isError
        && taskSessionId
        && parsedTaskDetails?.async?.state === 'running'
        && targetReportIds.length > 0
        && (storeSubagentStatuses.length === 0 || storeSubagentStatuses.length < (parsedTaskDetails.progress?.length ?? 0)),
    );
    const syncRuntime = React.useContext(SyncRuntimeContext);
    const syncDirStore = React.useMemo(() => {
        if (!syncRuntime || !shouldReadReportStatuses) return null;
        const dir = currentDirectory || syncRuntime.currentDirectory.get();
        return syncRuntime.childStores.ensureChild(dir);
    }, [currentDirectory, shouldReadReportStatuses, syncRuntime]);
    const reportSummaryKey = React.useSyncExternalStore(
        React.useCallback(
            (notify) => (syncDirStore && shouldReadReportStatuses ? syncDirStore.subscribe(notify) : () => undefined),
            [shouldReadReportStatuses, syncDirStore],
        ),
        React.useCallback(() => {
            if (!syncDirStore || !shouldReadReportStatuses || !taskSessionId) return '';
            const messages = syncDirStore.getState().message[taskSessionId];
            if (!messages || messages.length === 0) return '';
            return serializeReportStatuses(collectSubagentReports(messages), targetReportIds);
        }, [shouldReadReportStatuses, syncDirStore, targetReportIds, taskSessionId]),
        () => '',
    );
    const reportStatuses = React.useMemo(
        () => parseReportStatuses(reportSummaryKey),
        [reportSummaryKey],
    );

    React.useEffect(() => {
        if (!taskSessionId) return;
        const shouldHydrateTask = isSubagent && parsedTaskDetails?.async?.state === 'running';
        const shouldHydrateVibe = isVibeSpawn && !vibeSubtaskKey;
        if (!shouldHydrateTask && !shouldHydrateVibe) return;
        void useSubagentsStore.getState().hydrateParent(taskSessionId);
    }, [isSubagent, isVibeSpawn, parsedTaskDetails?.async?.state, runtimeKey, taskSessionId, vibeSubtaskKey]);

    // The result's own one-line summary (match counts, exit status, diff stats,
    // todo progress) sits beside the call's target, unless it repeats it.
    const resultSummary = React.useMemo(() => {
        if (!result || (result.isError && !isEvalTool(toolName))) return null;
        const summary = isEvalTool(toolName)
            ? evalResultSummary(resultContent.details, t as (key: string, params?: Record<string, unknown>) => string)
            : isSubagent
                ? describeTaskResultWithSubagents(resultContent.details, storeSubagentStatuses, reportStatuses, expectedTaskNames)
                : describeToolResult(resultContent.details, toolName);
        return summary && summary !== described.text ? summary : null;
    }, [described.text, expectedTaskNames, isSubagent, reportStatuses, result, resultContent.details, storeSubagentStatuses, t, toolName]);
    const intent = React.useMemo(() => {
        const rawIntent = call ? z.string().safeParse(call.input.i).data : undefined;
        return rawIntent === undefined ? null : normalizeIntent(rawIntent);
    }, [call]);
    const primaryDescription = guestHeader?.subtitle ?? (described.text || intent || '');
    const secondaryIntent = intent && primaryDescription && intent !== primaryDescription && !guestHeader?.subtitle
        ? intent
        : null;
    const description = primaryDescription;
    const title = guestHeader?.title ?? displayName;

    const callStatus = call?.status;
    const failed = result?.isError ?? (callStatus === 'failed' || callStatus === 'denied');
    const running = callStatus ? (callStatus === 'running' || callStatus === 'approved' || callStatus === 'pending_approval') : !result;
    const hasStoreSubagentRows = storeSubagentStatuses.length > 0;
    const hasStructuredSubagentRows = React.useMemo(() => {
        if (!isSubagent) return false;
        if (hasStoreSubagentRows) return true;
        return Boolean(parsedTaskDetails?.progress && parsedTaskDetails.progress.length > 0);
    }, [hasStoreSubagentRows, isSubagent, parsedTaskDetails]);
    const diffStats = React.useMemo(() => {
        if (diffs.length === 0) return null;
        let added = 0;
        let removed = 0;
        for (const diff of diffs) {
            added += diff.additions;
            removed += diff.deletions;
        }
        return { added, removed };
    }, [diffs]);

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

    // Opening a row below its header grows it downward. The timeline is told
    // before the growth so it can let go of the end first, as a gesture does;
    // otherwise the viewport slides by the whole row and carries the header
    // the reader clicked off the top.
    const toggleRow = () => {
        if (!isExpanded) dispatchRowExpand(rowRef.current);
        onToggle(part.partId);
    };

    const handleMainClick = () => {
        if (isSubagentTool(toolName) || isVibeSubagentTool(toolName) || !runtime?.editor || !quickOpenTarget) {
            toggleRow();
            return;
        }
        openQuickTarget();
    };

    const handleMainKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleMainClick();
    };

    const shouldRenderExpandedContent = useDeferredExpandedContent(isExpanded);
    const iconStyle = failed ? TOOL_ERROR_ICON_STYLE : TOOL_NORMAL_ICON_STYLE;
    const titleStyle = failed ? TOOL_ERROR_TITLE_STYLE : TOOL_NORMAL_TITLE_STYLE;
    const popupContent = React.useMemo(() => {
        const body = result
            ? [
                capToolOutputText(resultContent.text),
                resultContent.details == null ? '' : capToolOutputText(JSON.stringify(resultContent.details, null, 2)),
            ].filter(Boolean).join('\n\n')
            : call?.input ? formatToolInput(call.input, toolName) : '';
        return body;
    }, [call?.input, result, resultContent.details, resultContent.text, toolName]);
    const popupLanguage = isShellTool(toolName) ? 'bash'
        : detectToolOutputLanguage(toolName, popupContent, call?.input);

    return (
        <ToolPartErrorBoundary
            displayName={title}
            errorLabel={t('chat.toolPart.error')}
            resetKey={part}
            toolName={toolName}
        >
            <div ref={rowRef}>
                <div
                    className="group/tool flex gap-1.5 pr-2 pl-px py-1.5 rounded-xl items-center cursor-pointer"
                    onClick={handleMainClick}
                    onKeyDown={handleMainKeyDown}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                >
                    <div className="flex items-center flex-shrink-0">
                        <div
                            className="relative h-5 w-3.5 flex-shrink-0"
                            onClick={(event) => { event.stopPropagation(); toggleRow(); }}
                        >
                            <button
                                type="button"
                                className="absolute inset-0 flex !min-h-0 !min-w-0 items-center justify-center bg-transparent p-0 border-0"
                                aria-expanded={isExpanded}
                                aria-label={title}
                                onClick={(event) => { event.stopPropagation(); toggleRow(); }}
                            >
                                <span
                                    className={cn(
                                        'absolute inset-0 flex items-center justify-center transition-opacity',
                                        isExpanded && 'opacity-0',
                                        !isExpanded && 'group-hover/tool:opacity-0'
                                    )}
                                    style={iconStyle}
                                >
                                    {getToolIcon(toolName, presentation)}
                                </span>
                                <span
                                    className={cn(
                                        'absolute inset-0 transition-opacity flex items-center justify-center',
                                        isExpanded && 'opacity-100',
                                        !isExpanded && 'opacity-0 group-hover/tool:opacity-100'
                                    )}
                                >
                                    {isExpanded ? <Icon name="arrow-down-s" className="h-3.5 w-3.5" /> : <Icon name="arrow-right-s" className="h-3.5 w-3.5" />}
                                </span>
                            </button>
                        </div>
                        <div className={cn('flex items-center min-w-0 flex-1', (quickOpenTarget || vibeSubtask) ? 'gap-1' : 'gap-2')}>
                            <MinDurationShineText
                                active={Boolean(running && !failed)}
                                minDurationMs={300}
                                className={cn(TOOL_ROW_TITLE_CLASS, 'flex-shrink-0')}
                                style={titleStyle}
                                title={title}
                            >
                                {title}
                            </MinDurationShineText>
                            {quickOpenTarget ? (
                                <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); openQuickTarget(); }}
                                    className={cn(
                                        'flex-shrink-0 inline-flex h-4 w-4 items-center justify-center rounded transition-opacity hover:bg-interactive-hover',
                                        'opacity-60 hover:opacity-100 focus-visible:opacity-100',
                                    )}
                                    style={{ color: 'var(--tools-icon)' }}
                                    title={t('chat.toolPart.openFile')}
                                    aria-label={t('chat.toolPart.openFile')}
                                >
                                    <Icon name="external-link" className="h-3 w-3" />
                                </button>
                            ) : null}
                            {vibeSubtask ? (
                                <OpenSubtaskButton
                                    sessionId={vibeSubtask.childSessionId}
                                    agent={vibeSubtask.role}
                                    label={vibeSubtask.label}
                                    directory={currentDirectory}
                                    isMobile={isMobile}
                                />
                            ) : null}
                        </div>
                    </div>

                    <div className={cn('flex items-center gap-1 flex-1 min-w-0', TOOL_ROW_DESCRIPTION_CLASS)} style={{ color: 'var(--tools-description)' }}>
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                            {description ? (
                                described.path ? (
                                    renderAnimatedPathWithIcon(description, animateTailText, false, showToolFileIcons)
                                ) : (
                                    <Text
                                        variant={animateTailText ? 'generate-effect' : 'static'}
                                        className={cn('min-w-0 truncate', TOOL_ROW_DESCRIPTION_CLASS)}
                                        style={{ color: 'var(--tools-description)' }}
                                        title={description}
                                    >
                                        {description}
                                    </Text>
                                )
                            ) : null}
                            {secondaryIntent ? (
                                <span
                                    data-testid="tool-part-intent"
                                    className="min-w-0 truncate typography-meta text-muted-foreground/75"
                                    title={secondaryIntent}
                                >
                                    · {secondaryIntent}
                                </span>
                            ) : null}
                            {resultSummary ? (
                                <span className="flex-shrink-0 typography-meta text-muted-foreground/70" title={resultSummary}>
                                    {resultSummary}
                                </span>
                            ) : null}
                            {diffStats ? (
                                <span className="flex-shrink-0 inline-flex items-center gap-0 typography-meta" style={{ fontSize: '0.8rem', lineHeight: '1' }}>
                                    <span style={{ color: 'var(--status-success)' }}>+{diffStats.added}</span>
                                    <span style={{ color: 'var(--tools-description)' }}>/</span>
                                    <span style={{ color: 'var(--status-error)' }}>-{diffStats.removed}</span>
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div
                    aria-hidden={!isExpanded}
                    style={{
                        height: isExpanded ? 'auto' : '0px',
                        overflow: isExpanded ? 'visible' : 'hidden',
                        overflowAnchor: 'none',
                    }}
                >
                    {shouldRenderExpandedContent ? (
                        <div className="relative ml-2 pl-3">
                            {isTodoTool(toolName) && result && !result.isError ? (() => {
                                const phases = extractTodoPhases(resultContent.details);
                                return phases && hasTodoTasks(phases) ? <TodoCard phases={phases} defaultExpanded /> : null;
                            })() : null}
                            {isMemoryTool(toolName) && result && !result.isError ? (
                                <MemoryToolCard toolName={toolName} input={call?.input ?? {}} result={resultContent} />
                            ) : null}
                            <BlockLine onToggle={toggleRow} topOffset={1} />
                            <ToolExpandedContent
                                part={part}
                                call={call}
                                sessionId={sessionId}
                                isMobile={isMobile}
                                currentDirectory={currentDirectory}
                                isExpanded={isExpanded}
                                onShowPopup={onShowPopup}
                                presentation={presentation}
                                resultContent={resultContent}
                                fileChanges={fileChanges}
                                toolName={toolName}
                                hasStructuredSubagentRows={hasStructuredSubagentRows}
                            />
                            {call && isSubagentTool(toolName) ? (
                                <TaskToolSessions call={call} resultDetails={resultContent.details} sessionId={sessionId} directory={directory} isMobile={isMobile} />
                            ) : null}
                            {onShowPopup && popupContent ? (
                                <div className="mb-1 flex items-center justify-end gap-1">
                                    {result ? (
                                        <Button variant="ghost" size="xs" onClick={(event) => {
                                            event.stopPropagation();
                                            void copyTextToClipboard(resultContent.text).then((copied) => {
                                                if (copied.ok) toast.success(t('chat.toolPart.copiedOutput'));
                                                else toast.error(t('chat.toolPart.copyOutputFailed'));
                                            });
                                        }} aria-label={t('chat.toolPart.copyOutput')}>
                                            <Icon name="file-copy" className="h-3.5 w-3.5" />
                                        </Button>
                                    ) : null}
                                    <Button variant="ghost" size="xs" onClick={(event) => {
                                        event.stopPropagation();
                                        onShowPopup({
                                            open: true,
                                            title,
                                            toolResult: result,
                                            content: popupContent,
                                            language: popupLanguage,
                                            toolName,
                                            input: call?.input,
                                        });
                                    }} aria-label={title}>
                                        <Icon name="external-link" className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </ToolPartErrorBoundary>
    );
};

export default React.memo(ToolPart, (prev, next) => {
    return areRenderRelevantPartsEqual([prev.part], [next.part])
        && prev.pairedCall === next.pairedCall
        && prev.isExpanded === next.isExpanded
        && prev.isMobile === next.isMobile
        && prev.sessionId === next.sessionId
        && prev.directory === next.directory
        && prev.alwaysShowActions === next.alwaysShowActions
        && prev.onToggle === next.onToggle
        && prev.onShowPopup === next.onShowPopup
        && prev.animateTailText === next.animateTailText;
});
