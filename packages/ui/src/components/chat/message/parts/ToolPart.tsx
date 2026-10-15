import React from 'react';
import type { Subagent, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';
import { JsonTreeViewer } from '@/components/ui/JsonTreeViewer';
import { toast } from '@/components/ui';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useI18n } from '@/lib/i18n';
import { getToolMetadata } from '@/lib/toolHelpers';
import { cn } from '@/lib/utils';
import { normalizeToolName, toolDescription } from '@/lib/opencode/tools';
import type { ToolPopupContent } from '../types';
import {
    capToolOutputText,
    coerceToText,
    detectLanguageFromOutput,
    formatInputForDisplay,
    renderGlobOutput,
    renderGrepOutput,
    renderWebSearchOutput,
    tryParseJsonOutput,
} from '../toolRenderers';
import { getToolIcon } from './toolPresentation';
import { guestToolTableRows, renderGuestToolHeader, useGuestToolPresentation } from '@/lib/guests/tool-presentation';
import { GuestToolTable } from './GuestToolTable';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { getSyncSessions } from '@/sync/sync-refs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useChatColumnActions, useChatSessionSelection } from '../../chatColumnSession';

type TaskChildrenState = {
    sessionId: string;
    runtimeKey: string;
    toolCallId: string;
    status: 'loading' | 'ready' | 'failed';
    children: Subagent[];
};

const TaskToolSessions = ({ call, sessionId: addressedSessionId, directory: addressedDirectory, isMobile }: {
    call: ToolCallPart;
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
    const [state, setState] = React.useState<TaskChildrenState | null>(null);
    const [retry, setRetry] = React.useState(0);

    React.useEffect(() => {
        if (!sessionId || !directory) return;
        let current = true;
        const owner = { sessionId, runtimeKey, toolCallId: call.toolCallId };
        setState(previous => ({ ...owner, status: 'loading', children: previous?.sessionId === sessionId
            && previous.runtimeKey === runtimeKey && previous.toolCallId === call.toolCallId ? previous.children : [] }));
        void canonicalClient.listSubagents(sessionId).then(records => {
            if (!current || getRuntimeKey() !== runtimeKey) return;
            const children = records.filter(child => child.parentSessionId === sessionId && child.toolCallId === call.toolCallId);
            const global = useGlobalSessionsStore.getState();
            const parent = getSyncSessions(directory).find(session => session.sessionId === sessionId) ?? global.entityById.get(sessionId);
            if (parent) global.upsertSubagents(parent, children);
            setState({ ...owner, status: 'ready', children });
        }).catch(() => {
            if (current && getRuntimeKey() === runtimeKey) setState(previous => previous ? { ...previous, status: 'failed' } : null);
        });
        return () => { current = false; };
    }, [sessionId, directory, runtimeKey, call.toolCallId, call.status, retry]);

    if (!sessionId || !directory || state?.sessionId !== sessionId || state.runtimeKey !== runtimeKey || state.toolCallId !== call.toolCallId) return null;
    const openChild = (child: Subagent) => {
        if (column.pinned) column.openSession(child.childSessionId, directory);
        else if (isMobile) useSessionUIStore.getState().setCurrentSession(child.childSessionId, directory);
        else useUIStore.getState().openContextPanelTab(directory, {
            mode: 'chat', dedupeKey: `session:${child.childSessionId}`, label: child.role, readOnly: true,
        });
    };
    return (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 typography-meta">
            {state.children.map(child => (
                <Button key={child.subagentId} variant="ghost" size="xs" onClick={() => openChild(child)}
                    aria-label={t('chat.toolPart.openSubtask', { type: child.role })}>
                    <Icon name="external-link" className="h-3.5 w-3.5" />
                    {child.role}
                </Button>
            ))}
            {state.status === 'loading' ? <span className="text-muted-foreground">{t('common.loading')}</span> : null}
            {state.status === 'failed' || state.status === 'ready' && state.children.length === 0 ? (
                <>
                    <span className="text-muted-foreground">{state.status === 'failed' || call.status !== 'running'
                        ? t('common.unavailable') : t('chat.toolPart.awaitingResponse')}</span>
                    <Button variant="ghost" size="xs" onClick={() => setRetry(value => value + 1)}>{t('errorBoundary.actions.tryAgain')}</Button>
                </>
            ) : null}
        </div>
    );
};

interface ToolPartProps {
    part: ToolCallPart | ToolResultPart;
    sessionId?: string;
    directory?: string | null;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    isMobile: boolean;
    alwaysShowActions?: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
    animateTailText?: boolean;
}
const resultOutputText = (result: ToolResultPart | undefined): string => result?.output === null ? 'null' : coerceToText(result?.output);


/** Canonical calls and results are separate content parts, not mutable tool states. */
const ToolPart: React.FC<ToolPartProps> = ({ part, sessionId, directory, isExpanded, onToggle, isMobile, onShowPopup }) => {
    const { t } = useI18n();
    const toolName = normalizeToolName(part.toolName);
    const displayName = getToolMetadata(toolName).displayName;
    const call = part.type === 'tool_call' ? part : undefined;
    const result = part.type === 'tool_result' ? part : undefined;
    const presentation = useGuestToolPresentation(part.toolName);
    const guestHeader = React.useMemo(() => presentation ? renderGuestToolHeader(presentation, {
        input: call?.input,
        output: result ? resultOutputText(result) : undefined,
        metadata: undefined,
    }) : null, [call?.input, presentation, result]);
    const title = guestHeader?.title ?? displayName;
    const described = React.useMemo(() => toolDescription(part.toolName, call?.input, undefined), [call?.input, part.toolName]);
    const description = described?.kind === 'path' || described?.kind === 'text' ? described.value
        : described?.kind === 'files' ? t('chat.toolPart.filesCount', { count: described.count })
        : described?.kind === 'questions' ? t('chat.toolPart.questionsAsked', { count: described.count })
        : described?.kind === 'tools' ? described.calls.map(({ name, count }) => count > 1 ? `${name} ×${count}` : name).join(', ')
        : '';
    const failed = result ? result.isError : call?.status === 'failed' || call?.status === 'denied';
    const running = call?.status === 'running';
    const statusLabel = !call ? t('chat.toolPart.output')
        : call.status === 'completed' ? t('chat.todo.completed')
        : call.status === 'cancelled' ? t('chat.todo.cancelled')
        : failed ? t('chat.toolPart.error')
        : running ? t('chat.todo.inProgress')
        : t('chat.toolPart.awaitingResponse');
    const [rawJson, setRawJson] = React.useState(false);

    React.useEffect(() => setRawJson(false), [part.partId]);

    // Only expanded rows parse/highlight their body payload. Results do not
    // invent the call's input, timestamps, attachments, or child-session metadata.
    const content = React.useMemo(() => {
        if (!isExpanded) return '';
        return capToolOutputText(call
            ? formatInputForDisplay(call.input, part.toolName)
            : resultOutputText(result));
    }, [call, isExpanded, part.toolName, result]);
    const json = React.useMemo(() => tryParseJsonOutput(content), [content]);
    const language = React.useMemo(
        () => presentation?.language ?? detectLanguageFromOutput(content, toolName, call?.input),
        [call?.input, content, presentation?.language, toolName],
    );
    const bodyId = React.useId();

    const copyOutput = async () => {
        const copied = await copyTextToClipboard(resultOutputText(result));
        if (copied) toast.success(t('chat.toolPart.copiedOutput'));
        else toast.error(t('chat.toolPart.copyOutputFailed'));
    };

    const renderContent = () => {
        if (!content) {
            return <span className="typography-meta text-muted-foreground">{t('chat.toolPart.noOutputProduced')}</span>;
        }
        if (result && presentation?.output === 'table' && presentation.columns?.length && !rawJson) {
            const rows = guestToolTableRows(result.output);
            if (rows) return <GuestToolTable rows={rows} columns={presentation.columns} />;
        }
        if (json.isJson && !rawJson) return <JsonTreeViewer data={json.data} />;
        if (result && !json.isJson) {
            if (toolName === 'grep') return renderGrepOutput(content, isMobile, { unstyled: true });
            if (toolName === 'glob') return renderGlobOutput(content, isMobile, { unstyled: true });
            if (toolName === 'websearch' || toolName === 'web-search') return renderWebSearchOutput(content, { unstyled: true });
        }
        return <WorkerHighlightedCode code={content} language={json.isJson ? 'json' : language} wrap={isMobile} />;
    };

    return (
        <div className="group/tool w-full min-w-0 py-1">
            <button
                type="button"
                className="flex w-full min-w-0 items-center gap-1.5 text-left typography-meta"
                onClick={() => onToggle(part.partId)}
                aria-expanded={isExpanded}
                aria-controls={bodyId}
            >
                <span style={{ color: failed ? 'var(--status-error)' : 'var(--tools-icon)' }}>
                    {failed ? <Icon name="error-warning" className="h-3.5 w-3.5" /> : getToolIcon(toolName, presentation)}
                </span>
                <span className="min-w-0 truncate font-medium" style={{ color: failed ? 'var(--status-error)' : 'var(--tools-title)' }}>
                    {title}
                </span>
                {guestHeader?.subtitle || description ? <span className="min-w-0 truncate text-muted-foreground">{guestHeader?.subtitle ?? description}</span> : null}
                {running ? <Icon name="loader-4" className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
                <span className="ml-auto shrink-0 text-muted-foreground">
                    {failed ? t('chat.toolPart.error') : statusLabel}
                </span>
                <Icon name={isExpanded ? 'arrow-down-s' : 'arrow-right-s'} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            {isExpanded ? (
                <div id={bodyId} className="min-w-0 pl-5 pt-2">
                    {call && toolName === 'task' ? <TaskToolSessions call={call} sessionId={sessionId} directory={directory} isMobile={isMobile} /> : null}
                    {result?.error ? (
                        <div className="mb-2 break-words typography-meta text-[var(--status-error)]">
                            {t('chat.toolPart.error')} {result.error}
                        </div>
                    ) : null}
                    <div className="mb-1 flex items-center justify-end gap-1">
                        {json.isJson ? (
                            <Button variant="ghost" size="xs" onClick={() => setRawJson((value) => !value)}>
                                {rawJson ? t('chat.toolPart.showNavigableJson') : t('chat.toolPart.showRawJson')}
                            </Button>
                        ) : null}
                        {result?.output !== undefined ? (
                            <Button variant="ghost" size="xs" onClick={() => void copyOutput()} aria-label={t('chat.toolPart.copyOutput')}>
                                <Icon name="file-copy" className="h-3.5 w-3.5" />
                            </Button>
                        ) : null}
                        {onShowPopup && content ? (
                            <Button variant="ghost" size="xs" onClick={() => onShowPopup({ open: true, title, content, language })} aria-label={title}>
                                <Icon name="external-link" className="h-3.5 w-3.5" />
                            </Button>
                        ) : null}
                    </div>
                    <ScrollShadow className={cn('max-h-[60vh] min-w-0 overflow-auto', isMobile && 'break-words')}>
                        {renderContent()}
                    </ScrollShadow>
                </div>
            ) : null}
        </div>
    );
};

export default React.memo(ToolPart);
