import type { ToolPopupContent } from '../types';
import React from 'react';

import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { HighlightedCode } from '@/components/code/HighlightedCode';
import { Icon } from '@/components/icon/Icon';
import { JsonTreeViewer } from '@/components/ui/JsonTreeViewer';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useI18n } from '@/lib/i18n';
import {
    splitEvalOutput,
    type EvalCellView,
    type EvalTableColumn,
} from '@/lib/toolPresentation';
import { cn } from '@/lib/utils';
import { BusyDots } from './BusyDots';
import { EvalStepList } from './EvalStepList';
import { MinDurationShineText } from './MinDurationShineText';
import { renderTerminalOutput } from './toolOutput';

const CODE_STYLE: React.CSSProperties = {
    backgroundColor: 'transparent',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    lineHeight: '1.25rem',
};

const TABLE_CELL_CLASS = 'min-w-[80px] max-w-[320px] whitespace-normal [overflow-wrap:anywhere] px-3 py-1.5 border-e border-border/30 last:border-e-0';

const EvalTableView: React.FC<{
    columns: EvalTableColumn[];
    rows: string[][];
}> = ({ columns, rows }) => {
    return (
        <div data-testid="eval-view-table" className="flex w-fit max-w-full flex-col gap-1 my-1">
            <ScrollableOverlay
                outerClassName="overlay-scrollbar-wrapper--no-gutter oc-tile rounded-lg border border-border/30 bg-card/20"
                fillContainer={false}
            >
                <table className="w-max border-collapse text-xs">
                    <thead>
                        <tr className="border-b border-border/30 bg-muted/30">
                            {columns.map((col, c) => (
                                <th
                                    key={c}
                                    className={cn(
                                        TABLE_CELL_CLASS,
                                        'font-semibold text-foreground text-start',
                                        col.numeric && 'text-end font-mono'
                                    )}
                                >
                                    {col.head}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, r) => (
                            <tr
                                key={r}
                                className={r === rows.length - 1 ? 'border-0' : 'border-b border-border/20'}
                            >
                                {columns.map((col, c) => (
                                    <td
                                        key={c}
                                        className={cn(
                                            TABLE_CELL_CLASS,
                                            'text-foreground/90',
                                            col.numeric && 'text-end font-mono'
                                        )}
                                    >
                                        {row[c] ?? ''}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ScrollableOverlay>
        </div>
    );
};

interface EvalCellBlockProps {
    cell: EvalCellView;
    cellIndex: number;
    totalCells: number;
    onShowPopup?: (content: ToolPopupContent) => void;
}

const COLLAPSE_LINE_THRESHOLD = 40;

export const EvalCellBlock: React.FC<EvalCellBlockProps> = ({
    cell,
    cellIndex,
    totalCells,
    onShowPopup,
}) => {
    const { t } = useI18n();
    const [isCodeExpanded, setIsCodeExpanded] = React.useState(false);

    const isFailed = cell.status === 'error' || (typeof cell.exitCode === 'number' && cell.exitCode !== 0);
    const isRunning = cell.status === 'running';
    const isComplete = cell.status === 'complete';

    const lines = React.useMemo(() => (cell.code ? cell.code.split('\n') : []), [cell.code]);
    const needsCollapse = lines.length > COLLAPSE_LINE_THRESHOLD;
    const displayedCode = React.useMemo(() => {
        if (!needsCollapse || isCodeExpanded) return cell.code;
        return lines.slice(0, COLLAPSE_LINE_THRESHOLD).join('\n');
    }, [cell.code, isCodeExpanded, lines, needsCollapse]);

    const outputParts = React.useMemo(() => {
        return splitEvalOutput(cell.output, cell.views);
    }, [cell.output, cell.views]);

    const durationText = React.useMemo(() => {
        if (cell.durationMs === undefined || cell.durationMs <= 0) return null;
        return cell.durationMs >= 1000
            ? `${(cell.durationMs / 1000).toFixed(1)}s`
            : `${Math.round(cell.durationMs)}ms`;
    }, [cell.durationMs]);

    const caption = React.useMemo(() => {
        if (totalCells > 1) {
            return `${cellIndex + 1}/${totalCells}${cell.title ? ` · ${cell.title}` : ''}`;
        }
        return cell.title ?? '';
    }, [cell.title, cellIndex, totalCells]);

    const codeLanguage = cell.language === 'js' ? 'javascript' : 'python';

    return (
        <div
            data-testid="eval-cell-block"
            data-cell-index={cellIndex}
            data-cell-status={cell.status}
            className={cn(
                'rounded-xl border p-2.5 space-y-2 transition-colors',
                isFailed
                    ? 'border-destructive/40 bg-destructive/5'
                    : isRunning
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/40 bg-card/40'
            )}
        >
            {/* Header bar */}
            <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 flex items-center justify-center">
                        {isRunning ? (
                            <BusyDots />
                        ) : isFailed ? (
                            <Icon name="error-warning" className="size-3.5 text-destructive" />
                        ) : isComplete ? (
                            <Icon name="check" className="size-3.5 text-[var(--status-success)]" />
                        ) : (
                            <Icon name="time" className="size-3.5 text-muted-foreground/60" />
                        )}
                    </span>

                    {caption ? (
                        <span className="font-medium text-foreground/90 truncate select-text">
                            {isRunning ? (
                                <MinDurationShineText active={isRunning} minDurationMs={300}>
                                    {caption}
                                </MinDurationShineText>
                            ) : (
                                caption
                            )}
                        </span>
                    ) : null}

                    <span
                        data-testid="eval-cell-language"
                        className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-medium bg-muted/60 text-muted-foreground border border-border/40 select-none shrink-0"
                    >
                        {cell.language}
                    </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {durationText ? (
                        <span
                            data-testid="eval-cell-duration"
                            className="text-muted-foreground/70 font-mono text-[11px]"
                        >
                            {durationText}
                        </span>
                    ) : null}

                    {isFailed ? (
                        <span
                            data-testid="eval-cell-failure"
                            className="px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-destructive/15 text-destructive border border-destructive/30"
                        >
                            {typeof cell.exitCode === 'number' && cell.exitCode !== 0
                                ? t('chat.eval.exitCode', { code: cell.exitCode })
                                : t('chat.eval.failed')}
                        </span>
                    ) : null}
                </div>
            </div>

            {/* Code Block */}
            {cell.code ? (
                <div className="relative rounded-lg border border-border/30 bg-card/60 overflow-hidden">
                    <HighlightedCode
                        language={codeLanguage}
                        code={displayedCode}
                        style={CODE_STYLE}
                        wrap
                    />

                    {needsCollapse ? (
                        <div className="p-1.5 border-t border-border/20 bg-muted/20 flex justify-end">
                            <button
                                type="button"
                                data-testid="eval-code-toggle"
                                onClick={() => setIsCodeExpanded((prev) => !prev)}
                                className="text-xs text-primary hover:underline font-sans cursor-pointer px-1 py-0.5"
                            >
                                {isCodeExpanded
                                    ? t('chat.eval.collapseLines')
                                    : t('chat.eval.showAllLines', { count: lines.length })}
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Step Timeline */}
            <EvalStepList
                statusEvents={cell.statusEvents}
                statusEventsElided={cell.statusEventsElided}
                isCellRunning={isRunning}
                onShowPopup={onShowPopup}
            />

            {/* Outputs (text, table, json, markdown) */}
            {outputParts.length > 0 ? (
                <div data-testid="eval-cell-output" className="space-y-1.5 pt-1">
                    {outputParts.map((part, pIdx) => {
                        if (part.kind === 'view') {
                            const view = part.view;
                            if (view.kind === 'table') {
                                return (
                                    <EvalTableView
                                        key={pIdx}
                                        columns={view.columns}
                                        rows={view.rows}
                                    />
                                );
                            }
                            if (view.kind === 'json') {
                                return (
                                    <div
                                        key={pIdx}
                                        data-testid="eval-view-json"
                                        className="my-1 rounded-lg border border-border/30 bg-card/20 p-2"
                                    >
                                        <JsonTreeViewer
                                            data={view.value}
                                            initiallyExpandedDepth={1}
                                            maxHeight="350px"
                                        />
                                    </div>
                                );
                            }
                            if (view.kind === 'markdown') {
                                return (
                                    <div
                                        key={pIdx}
                                        data-testid="eval-view-markdown"
                                        className="my-1 text-sm text-foreground/90"
                                    >
                                        <SimpleMarkdownRenderer
                                            content={view.text}
                                            variant="tool"
                                            onShowPopup={onShowPopup}
                                        />
                                    </div>
                                );
                            }
                        }
                        if (part.kind !== 'text') return null;
                        return (
                            <pre
                                key={pIdx}
                                className="typography-code whitespace-pre-wrap break-words text-xs text-foreground/90 font-mono m-0 p-2 rounded-lg border border-border/20 bg-card/30 select-text"
                            >
                                {renderTerminalOutput(part.text)}
                            </pre>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
};
