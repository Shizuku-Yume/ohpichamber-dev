import React from 'react';
import type { Subagent } from '@openchamber/agent-contract';
import { z } from 'zod';
import { useChatSessionSelection } from '../../../chatColumnSession';
import { dispatchRowExpand } from '@/components/chat/lib/scroll/timelineScrollIntent';
import { cn } from '@/lib/utils';
import { BlockLine } from '../BlockLine';
import {
    detectToolOutputLanguage,
    formatToolInput,
    isAstEditTool,
    isEditTool,
    isEvalTool,
    isQuestionTool,
    isReadTool,
    isShellTool,
    isSubagentTool,
    isTodoTool,
    isVibeSubagentTool,
    isWriteTool,
    normalizeToolName,
    parseNativeReadPath,
    toolBaseName,
    toolInputPath,
    toolInputPaths,
    toolPresentation,
} from '@/lib/toolHelpers';
import {
    describeTaskResultWithSubagents,
    describeToolCall,
    describeToolResult,
    evalResultSummary,
    isMemoryTool,
    normalizeIntent,
    type TaskSubagentStatusEntry,
} from '@/lib/toolPresentation';
import { preferToolDisplayContent } from '../toolDisplayContent';
import { useVibeSpawnSubtask } from '@/hooks/useVibeSpawnSubtask';
import { TodoCard } from '../TodoCard';
import { MemoryToolCard } from '../MemoryToolCard';
import { extractTodoPhases } from '../../../todoData';
import { hasTodoTasks } from '../../../todoProgress';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { copyTextToClipboard } from '@/lib/clipboard';
import { Icon } from '@/components/icon/Icon';
import { MinDurationShineText } from '../MinDurationShineText';
import { getToolIcon } from '../toolPresentation';
import { renderGuestToolHeader, useGuestToolPresentation } from '@/lib/guests/tool-presentation';
import { capToolOutputText, nativeToolResultContent } from '../../toolRenderers';
import { getToolDiffs, getToolFileChanges, normalizeWorkspaceToolPath } from '../toolDiffUtils';
import { getRelativeFilePath } from '@/lib/path-utils';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { collectSubagentReports } from '../../../work-status/useSubagentReports';
import { SyncRuntimeContext } from '@/sync/sync-runtime-context';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { OpenSubtaskButton } from './OpenSubtaskButton';
import { TaskToolSessions } from './TaskToolSessions';
import { ToolExpandedContent } from './ToolExpandedContent';
import { useDeferredExpandedContent } from './deferredExpandedContent';
import { renderAnimatedPathWithIcon } from './toolPathRendering';
import { useToolRowOpenActions } from './useToolRowOpenActions';
import {
    TOOL_ERROR_ICON_STYLE,
    TOOL_ERROR_TITLE_STYLE,
    TOOL_NORMAL_ICON_STYLE,
    TOOL_NORMAL_TITLE_STYLE,
    TOOL_ROW_DESCRIPTION_CLASS,
    TOOL_ROW_TITLE_CLASS,
} from './toolRowStyles';
import { taskResultDetailsSchema, type ToolPartProps } from './types';

const EMPTY_STRING_ARRAY: readonly string[] = [];

const taskCallExpectedIdsSchema = z.object({
    name: z.string().trim().min(1).optional(),
    tasks: z.array(z.object({
        name: z.string().trim().min(1).optional(),
    })).optional(),
});

const evalSummaryParamsSchema = z.object({
    count: z.number().optional(),
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

export const ToolPartContent: React.FC<ToolPartProps> = ({
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
    const resultContent = React.useMemo(
        () => (result && !result.isError ? preferToolDisplayContent(toolName, rawResultContent) : rawResultContent),
        [rawResultContent, result, toolName],
    );
    const toolRow = toolPresentation(toolName, resultContent.details);
    const displayName = toolRow.label;
    const fileChanges = React.useMemo(() => getToolFileChanges(part, call), [part, call]);
    const diffs = React.useMemo(() => getToolDiffs(part, call), [part, call]);
    const guestHeader = React.useMemo(() => presentation ? renderGuestToolHeader(presentation, {
        input: call?.input,
        output: result ? resultContent.text : undefined,
        metadata: undefined,
    }) : null, [call?.input, presentation, result, resultContent.text]);

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
    const vibeSubtask = useVibeSpawnSubtask({
        enabled: isVibeSpawn,
        parentSessionId: taskSessionId,
        toolCallId: taskToolCallId,
        input: call?.input,
        details: resultContent.details,
        runtimeKey,
    });
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
        if (!isSubagent || !taskSessionId) return;
        if (parsedTaskDetails?.async?.state !== 'running') return;
        void useSubagentsStore.getState().hydrateParent(taskSessionId);
    }, [isSubagent, parsedTaskDetails?.async?.state, runtimeKey, taskSessionId]);

    const resultSummary = React.useMemo(() => {
        if (!result || (result.isError && !isEvalTool(toolName))) return null;
        const summary = isEvalTool(toolName)
            ? evalResultSummary(resultContent.details, (key, params) => {
                const count = evalSummaryParamsSchema.safeParse(params).data?.count ?? 0;
                if (key === 'chat.eval.cells') return t('chat.eval.cells', { count });
                if (key === 'chat.eval.toolCalls') return t('chat.eval.toolCalls', { count });
                return key;
            })
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

    const toggleRow = () => {
        if (!isExpanded) dispatchRowExpand(rowRef.current);
        onToggle(part.partId);
    };

    const {
        quickOpenTarget,
        handleMainRowClick,
        handleMainKeyDown,
        handleQuickOpen,
    } = useToolRowOpenActions({
        part,
        call,
        toolName,
        currentDirectory,
        onToggle: toggleRow,
    });

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

    const todoPhases = isTodoTool(toolName) && result && !result.isError
        ? extractTodoPhases(resultContent.details)
        : null;
    const hasStructuredTodoCard = Boolean(todoPhases && hasTodoTasks(todoPhases));
    const hasMemoryCard = isMemoryTool(toolName) && (!result || !result.isError);

    return (
        <div ref={rowRef}>
            <div
                className="group/tool flex gap-1.5 pe-2 ps-px py-1.5 rounded-xl items-center cursor-pointer"
                onClick={handleMainRowClick}
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
                                    !isExpanded && 'group-hover/tool:opacity-0',
                                )}
                                style={iconStyle}
                            >
                                {getToolIcon(toolName, presentation)}
                            </span>
                            <span
                                className={cn(
                                    'absolute inset-0 transition-opacity flex items-center justify-center',
                                    isExpanded && 'opacity-100',
                                    !isExpanded && 'opacity-0 group-hover/tool:opacity-100',
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
                                onClick={handleQuickOpen}
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
                    <div className="relative ms-2 ps-3">
                        {hasStructuredTodoCard && todoPhases ? <TodoCard phases={todoPhases} defaultExpanded /> : null}
                        {hasMemoryCard ? (
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
                            hasStructuredTodoCard={hasStructuredTodoCard}
                            hasMemoryCard={hasMemoryCard}
                        />
                        {call && isSubagentTool(toolName) ? (
                            <TaskToolSessions call={call} resultDetails={resultContent.details} sessionId={sessionId} directory={directory} isMobile={isMobile} />
                        ) : null}
                        {onShowPopup && popupContent ? (
                            <div className="mb-1 flex items-center justify-end gap-1">
                                {result ? (
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            void copyTextToClipboard(resultContent.text).then((copied) => {
                                                if (copied.ok) toast.success(t('chat.toolPart.copiedOutput'));
                                                else toast.error(t('chat.toolPart.copyOutputFailed'));
                                            });
                                        }}
                                        aria-label={t('chat.toolPart.copyOutput')}
                                    >
                                        <Icon name="file-copy" className="h-3.5 w-3.5" />
                                    </Button>
                                ) : null}
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={(event) => {
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
                                    }}
                                    aria-label={title}
                                >
                                    <Icon name="external-link" className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

ToolPartContent.displayName = 'ToolPartContent';
