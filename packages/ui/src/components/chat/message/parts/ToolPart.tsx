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
    formatToolInput,
    isEditTool,
    isEvalTool,
    isFindTool,
    isQuestionTool,
    isReadTool,
    isShellTool,
    isSubagentTool,
    isTodoTool,
    isWebSearchTool,
    isWriteTool,
    toolInputPaths,
    normalizeToolName,
    parseNativeReadPath,
    toolInputPath,
    toolPresentation,
} from '@/lib/toolHelpers';
import { describeToolCall, describeToolResult, evalResultSummary, isMemoryTool } from '@/lib/toolPresentation';
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
import { DiffViewToggle, type DiffViewMode } from '../DiffViewToggle';
import { EvalPresenter } from './EvalPresenter';
import { MinDurationShineText } from './MinDurationShineText';
import { getToolIcon } from './toolPresentation';
import { OpenChamberToolOutput } from './OpenChamberToolOutput';
import { toToolView } from './toolView';
import { hasOpenChamberView, parseOpenChamberEnvelope } from './openChamberToolEnvelope';
import { GuestToolTable } from './GuestToolTable';
import {
    guestToolTableRows,
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
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { WritePreview } from '../../DiffPreview';

type TaskChildrenState = {
    sessionId: string;
    runtimeKey: string;
    toolCallId: string;
    status: 'loading' | 'ready' | 'failed';
    children: Subagent[];
};

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

/** Child sessions join a task call by its exact native tool call identity. */
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
        setState(previous => ({
            ...owner,
            status: 'loading',
            children: previous?.sessionId === sessionId
                && previous.runtimeKey === runtimeKey
                && previous.toolCallId === call.toolCallId ? previous.children : [],
        }));
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

    const hideToolInputPreview = isEditTool(toolName);
    const isWrite = isWriteTool(toolName);
    const writeInput = isWrite ? writeInputSchema.safeParse(input).data : undefined;
    const writeContent = writeInput?.content;
    const writePath = writeInput?.path;

    const inputTextContent = React.useMemo(() => {
        if (!input || Object.keys(input).length === 0) return '';
        if (isWrite) return '';
        return formatToolInput(input, toolName);
    }, [input, isWrite, toolName]);
    const hasInputText = !hideToolInputPreview && !writeContent && inputTextContent.trim().length > 0;

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
            if (parsedQA.length > 0) {
                return renderScrollableBlock(
                    <div className="space-y-2">
                        {parsedQA.map((qa, index) => (
                            <div key={index} className="space-y-0.5">
                                <FormMarkdown content={qa.question} size="micro" className="text-muted-foreground" />
                                <div className="typography-meta text-foreground whitespace-pre-wrap">{qa.answer}</div>
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
            return renderScrollableBlock(
                <div className="w-full min-w-0">
                    <SimpleMarkdownRenderer content={outputString} variant="tool" onShowPopup={onShowPopup} />
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
            const findOutput = (
                <div className="space-y-1 font-mono text-xs">
                    {lines.map((line, idx) => {
                        const match = /^([^\s:]+):(\d+)(?:-(\d+))?\s+(.*)$/.exec(line);
                        if (match) {
                            const filePath = match[1]!;
                            const startLine = parseInt(match[2]!, 10);
                            const rest = match[4]!;
                            return (
                                <div key={idx} className="flex items-start gap-1.5 py-0.5">
                                    <button
                                        type="button"
                                        className="text-primary hover:underline font-medium shrink-0 cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const abs = toAbsoluteFilePath(currentDirectory, filePath);
                                            if (runtime?.editor) {
                                                void runtime.editor.openFile(abs, startLine);
                                            } else {
                                                useUIStore.getState().openContextFileAtLine(currentDirectory, abs, startLine, 1);
                                            }
                                        }}
                                    >
                                        {filePath}:{match[2]}{match[3] ? `-${match[3]}` : ''}
                                    </button>
                                    <span className="text-muted-foreground truncate">{rest}</span>
                                </div>
                            );
                        }
                        return <div key={idx} className="text-muted-foreground whitespace-pre-wrap">{line}</div>;
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

    const hasVisibleOutput = outputString.trim().length > 0;
    const shouldRenderResult = part.type === 'tool_result' || (isShellTool(toolName) && hasVisibleOutput) || fileChanges.length > 0;
    const hasVisualDiffEntry = fileChanges.some((entry) => !!entry.diff);

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
            ) : (
                <>
                    {hasInputText ? (
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

                    {writeContent ? (
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
    const toolRow = toolPresentation(toolName);
    const displayName = toolRow.label;

    const resultContent = React.useMemo(() => nativeToolResultContent(result), [result]);
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
        const filePath = isReadTool(toolName) || isEditTool(toolName) || isWriteTool(toolName) || isAstEditTool(toolName)
            ? toolInputPath(call.input)
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
    // The result's own one-line summary (match counts, exit status, diff stats,
    // todo progress) sits beside the call's target, unless it repeats it.
    const resultSummary = React.useMemo(() => {
        if (!result || (result.isError && !isEvalTool(toolName))) return null;
        const summary = isEvalTool(toolName)
            ? evalResultSummary(resultContent.details, t as (key: string, params?: Record<string, unknown>) => string)
            : describeToolResult(resultContent.details, toolName);
        return summary && summary !== described.text ? summary : null;
    }, [described.text, result, resultContent.details, t, toolName]);
    const description = guestHeader?.subtitle ?? described.text;
    const title = guestHeader?.title ?? displayName;

    const callStatus = call?.status;
    const failed = result?.isError ?? (callStatus === 'failed' || callStatus === 'denied');
    const running = callStatus ? (callStatus === 'running' || callStatus === 'approved' || callStatus === 'pending_approval') : !result;

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
        if (isSubagentTool(toolName)) return null;
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
        if (isSubagentTool(toolName) || !runtime?.editor || !quickOpenTarget) {
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
                                className="absolute inset-0 flex items-center justify-center bg-transparent p-0 border-0"
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
                        <div className={cn('flex items-center min-w-0 flex-1', quickOpenTarget ? 'gap-1' : 'gap-2')}>
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
                            />
                            {call && isSubagentTool(toolName) ? (
                                <TaskToolSessions call={call} sessionId={sessionId} directory={directory} isMobile={isMobile} />
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
