import React from 'react';
import type { ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { z } from 'zod';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../../MarkdownRenderer';
import { FormMarkdown } from '../../../FormMarkdown';
import { WritePreview } from '../../../DiffPreview';
import {
    askAnswers,
    isAstEditTool,
    isEditTool,
    isEvalTool,
    isFindTool,
    isQuestionTool,
    isShellTool,
    isSubagentTool,
    isWebSearchTool,
    isWriteTool,
    toolBaseName,
} from '@/lib/toolHelpers';
import { ToolScalarInputRows, ToolStructuredBody } from '../ToolStructuredBody';
import { StructuredToolInputPreview } from '../StructuredToolInputs';
import { isStructuredExpandedTool, resolveExpandedInputPreview, resolveStructuredToolInput } from '../toolDisplayContent';
import { findScoreBadgeStyle, parseFindLines } from '../findOutputParser';
import { Button } from '@/components/ui/button';
import type { ToolPopupContent } from '../../types';
import { Icon } from '@/components/icon/Icon';
import { DiffViewToggle, type DiffViewMode } from '../../DiffViewToggle';
import { EvalPresenter } from '../EvalPresenter';
import { useDefaultDiffViewMode } from '../../useDefaultDiffViewMode';
import { OpenChamberToolOutput } from '../OpenChamberToolOutput';
import { toToolView } from '../toolView';
import { hasOpenChamberView, parseOpenChamberEnvelope } from '../openChamberToolEnvelope';
import type { GuestToolRule } from '@/lib/guests/tool-presentation';
import { capToolOutputText, coerceToText, renderWebSearchOutput } from '../../toolRenderers';
import {
    extractFirstChangedLineFromDiff,
    normalizeWorkspaceToolPath,
    type ToolFileChange,
} from '../toolDiffUtils';
import { getRelativeFilePath, toAbsoluteFilePath } from '@/lib/path-utils';
import { useI18n } from '@/lib/i18n';
import { isActiveCallStatus, type NativeResultContent } from './types';
import { stripTaskSpawnBoilerplate } from './toolOutputText';
import { renderPathLikeGitChanges } from './toolPathRendering';
import { DiffPreview } from './DiffPreview';
import { ToolScrollableSection } from './ToolScrollableSection';
import { ToolScrollableTextOutput } from './ToolScrollableTextOutput';

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

const askTimedOutDetailsSchema = z.looseObject({
    timedOut: z.literal(true),
});

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
    hasStructuredTodoCard?: boolean;
    hasMemoryCard?: boolean;
    hasStructuredSubagentRows?: boolean;
}

export const ToolExpandedContent: React.FC<ToolExpandedContentProps> = React.memo(({
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
    hasStructuredTodoCard = false,
    hasMemoryCard = false,
}) => {
    const { t } = useI18n();
    const runtime = React.useContext(RuntimeAPIContext);
    const mobileActions = useMobileAppActions();
    const defaultDiffViewMode = useDefaultDiffViewMode();
    const [diffViewMode, setDiffViewMode] = React.useState<DiffViewMode>(defaultDiffViewMode);
    const [showRawToolAnswer, setShowRawToolAnswer] = React.useState(false);
    const [prevResetKey, setPrevResetKey] = React.useState(`${part.partId}\0${defaultDiffViewMode}`);

    const resetKey = `${part.partId}\0${defaultDiffViewMode}`;
    if (resetKey !== prevResetKey) {
        const partChanged = !prevResetKey.startsWith(`${part.partId}\0`);
        setPrevResetKey(resetKey);
        setDiffViewMode(defaultDiffViewMode);
        if (partChanged) {
            setShowRawToolAnswer(false);
        }
    }

    const input = call?.input;
    const rawOutput = resultContent.text;
    const hasStringOutput = rawOutput.length > 0;
    const outputString = rawOutput;
    const isStreamingShell = isShellTool(toolName) && Boolean(call && isActiveCallStatus(call.status));

    const openChamberEnvelope = React.useMemo(
        () => (part.type === 'tool_result' ? parseOpenChamberEnvelope(rawOutput) : null),
        [part.type, rawOutput],
    );

    const hasVisualDiffEntry = fileChanges.some((entry) => Boolean(entry.diff));
    const hideToolInputPreview = (isEditTool(toolName) || isAstEditTool(toolName) || toolBaseName(toolName) === 'apply_patch') && hasVisualDiffEntry;
    const isWrite = isWriteTool(toolName);
    const writeInput = isWrite ? writeInputSchema.safeParse(input).data : undefined;
    const writeContent = writeInput?.content;
    const writePath = writeInput?.path;

    const {
        scalarInputRows,
        inputTextContent,
        hasInputText,
        hasScalarInputRows,
    } = React.useMemo(
        () => resolveExpandedInputPreview({ input, toolName, isWrite, hideToolInputPreview, writeContent }),
        [hideToolInputPreview, input, isWrite, toolName, writeContent],
    );
    const structuredInput = React.useMemo(
        () => resolveStructuredToolInput(toolName, input, {
            hideAstEditInput: hasVisualDiffEntry,
            hideTodoInput: hasStructuredTodoCard,
        }),
        [hasStructuredTodoCard, hasVisualDiffEntry, input, toolName],
    );

    const webSearchOutput = React.useMemo(
        () => (isWebSearchTool(toolName) && part.type === 'tool_result' && !part.isError && hasStringOutput
            ? renderWebSearchOutput(part.output, { unstyled: true })
            : null),
        [hasStringOutput, part, toolName],
    );

    const renderScrollableBlock = (
        content: React.ReactNode,
        options?: { maxHeightClass?: string; className?: string; disableHorizontal?: boolean; outerClassName?: string; followKey?: string },
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
            const askTimedOut = askTimedOutDetailsSchema.safeParse(resultContent.details).success;
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
                    { maxHeightClass: 'max-h-[40vh]' },
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
                { maxHeightClass: 'max-h-[40vh]' },
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
                { className: 'p-1' },
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
                </div>,
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
                                <div key={idx} className="flex items-start gap-1.5 py-0.5 ps-2">
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
                    isStreaming={isStreamingShell}
                />
            );
            return renderScrollableBlock(output, {
                className: isShellTool(toolName) ? 'p-1 rounded-none' : 'p-1',
                maxHeightClass: isShellTool(toolName) ? 'max-h-[46vh]' : undefined,
                followKey: isStreamingShell ? outputString : undefined,
            });
        }

        if (part.type === 'tool_result' && resultContent.images.length > 0) return null;

        return renderScrollableBlock(
            <div className="typography-meta text-muted-foreground/70">{t('chat.toolPart.noOutputProduced')}</div>,
            { maxHeightClass: 'max-h-60' },
        );
    };

    const hasVisibleOutput = isSubagentTool(toolName) && hasStructuredSubagentRows
        ? stripTaskSpawnBoilerplate(outputString).trim().length > 0
        : outputString.trim().length > 0;
    const shouldRenderResult = isSubagentTool(toolName) && hasStructuredSubagentRows
        ? (hasVisibleOutput || fileChanges.length > 0)
        : (part.type === 'tool_result' || (isShellTool(toolName) && hasVisibleOutput) || fileChanges.length > 0);
    const bashStatus = React.useMemo(() => {
        if (!isShellTool(toolName)) return null;
        const parsed = bashStatusDetailsSchema.safeParse(resultContent.details);
        if (!parsed.success) return null;
        if (!parsed.data.async && !parsed.data.service) return null;
        return parsed.data;
    }, [resultContent.details, toolName]);
    const hasExpandedBody = Boolean(structuredInput)
        || hasStructuredTodoCard
        || hasMemoryCard
        || hasInputText
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
        <div className="relative pe-2 pb-2 pt-2 space-y-2 ps-4">
            {isEvalTool(toolName) ? (
                <EvalPresenter
                    call={call}
                    result={part.type === 'tool_result' ? part : undefined}
                    onShowPopup={onShowPopup}
                />
            ) : isQuestionTool(toolName) ? (
                renderResultContent()
            ) : isStructuredExpandedTool(toolName) ? (
                <ToolStructuredBody
                    toolName={toolName}
                    toolCallId={call?.toolCallId ?? part.toolCallId}
                    input={input}
                    details={resultContent.details}
                    outputText={outputString}
                    sessionId={sessionId}
                    directory={currentDirectory}
                    isMobile={isMobile}
                    isError={part.type === 'tool_result' ? part.isError : false}
                    errorText={part.type === 'tool_result' ? part.error : undefined}
                    onShowPopup={onShowPopup}
                />
            ) : (
                <>
                    {structuredInput ? (
                        <div className="my-1">
                            <StructuredToolInputPreview resolved={structuredInput} />
                        </div>
                    ) : null}
                    {hasScalarInputRows && scalarInputRows ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <ToolScalarInputRows rows={scalarInputRows} />,
                                {
                                    maxHeightClass: 'max-h-60',
                                    className: 'tool-input-surface',
                                },
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
                                },
                            )}
                        </div>
                    ) : null}
                    {writeContent && !hasVisualDiffEntry ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                <WritePreview content={writeContent} filePath={writePath} />,
                                { maxHeightClass: isExpanded ? 'max-h-[50vh]' : 'max-h-60', className: 'tool-input-surface' },
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
                            <div
                                className="typography-meta p-2 rounded-xl border"
                                style={{
                                    backgroundColor: 'var(--status-error-background)',
                                    color: 'var(--status-error)',
                                    borderColor: 'var(--status-error-border)',
                                }}
                            >
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
