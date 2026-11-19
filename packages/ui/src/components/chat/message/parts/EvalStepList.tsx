import type { ToolPopupContent } from '../types';
import React from 'react';

import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import type { EvalStatusEvent } from '@/lib/toolPresentation';
import { cn } from '@/lib/utils';
import { useWaitingBlink } from '@/hooks/useDurationTicker';
import { BusyDots } from './BusyDots';

const MINI_CODE_STYLE: React.CSSProperties = {
    backgroundColor: 'transparent',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--interactive-border)',
    fontSize: '0.75rem',
    lineHeight: '1rem',
};

const OP_ICON_MAP: Record<string, string> = {
    read: 'file-text',
    cat: 'file-text',
    touch: 'file-text',
    write: 'file-edit',
    grep: 'menu-search',
    glob: 'file-search',
    run: 'terminal',
    bash: 'terminal',
    sh: 'terminal',
    todo: 'task',
    log: 'information',
    phase: 'flag',
    agent: 'robot',
    completion: 'sparkling',
    env: 'settings',
    mcp_progress: 'tools',
    judge_batch: 'survey',
    workpool: 'group',
};

function formatEventSummary(event: EvalStatusEvent): string {
    const { op, ...data } = event;
    if (data.error) {
        return `${op}: ${String(data.error)}`;
    }

    switch (op) {
        case 'phase':
            return typeof data.title === 'string' ? data.title : op;
        case 'log':
            return typeof data.message === 'string' ? data.message : '';
        case 'read': {
            const count = data.chars ?? data.bytes ?? 0;
            const pathStr = data.path ? ` from ${String(data.path)}` : '';
            return `${count} chars${pathStr}`;
        }
        case 'write': {
            const count = data.chars ?? data.bytes ?? 0;
            const pathStr = data.path ? ` to ${String(data.path)}` : '';
            return `${count} chars${pathStr}`;
        }
        case 'grep': {
            const count = data.count ?? 0;
            const pat = data.pattern ? ` for "${String(data.pattern)}"` : '';
            return `${count} matches${pat}`;
        }
        case 'glob': {
            const count = data.count ?? 0;
            const pat = data.pattern ? ` matching "${String(data.pattern)}"` : '';
            return `${count} files${pat}`;
        }
        case 'run':
        case 'bash':
        case 'sh': {
            const cmd = data.cmd ? String(data.cmd) : '';
            const exit = typeof data.code === 'number' ? ` (exit ${data.code})` : '';
            return `${cmd}${exit}` || op;
        }
        case 'todo':
            return data.committed ? 'todo committed' : 'todo updated';
        case 'agent': {
            const parts: string[] = [];
            if (data.status) parts.push(String(data.status));
            if (data.currentTool) parts.push(String(data.currentTool));
            if (data.lastIntent) parts.push(String(data.lastIntent));
            if (data.model) parts.push(String(data.model));
            return parts.join(' · ') || 'agent progress';
        }
        case 'completion': {
            const parts: string[] = [];
            if (data.model) parts.push(String(data.model));
            if (data.chars) parts.push(`${data.chars} chars`);
            return parts.join(' · ') || op;
        }
        case 'mcp_progress': {
            const parts: string[] = [];
            if (data.tool) parts.push(String(data.tool));
            if (data.message) parts.push(String(data.message));
            return parts.join(' · ') || 'mcp progress';
        }
        default: {
            if (data.detail !== undefined) return String(data.detail);
            if (data.count !== undefined) return `${op} (${data.count})`;
            if (data.path) return `${op} ${String(data.path)}`;
            return op;
        }
    }
}

interface EvalStepListProps {
    statusEvents?: EvalStatusEvent[];
    statusEventsElided?: number;
    isCellRunning?: boolean;
    onShowPopup?: (content: ToolPopupContent) => void;
}

// Its own component: the shared waiting blink re-renders this row once a
// second, not the step list around it.
const RunningRow: React.FC<{ label: string }> = ({ label }) => {
    const blink = useWaitingBlink(true);
    return (
        <div data-testid="eval-step-running" className="flex items-center gap-1.5 py-0.5 px-1 text-primary">
            <span className="text-muted-foreground/50 select-none shrink-0">└── </span>
            <BusyDots />
            <span className={cn('font-sans text-[11px] font-medium', blink)}>{label}</span>
        </div>
    );
};

export const EvalStepList: React.FC<EvalStepListProps> = ({
    statusEvents = [],
    statusEventsElided = 0,
    isCellRunning = false,
}) => {
    const { t } = useI18n();
    const [expandedRows, setExpandedRows] = React.useState<Record<number, boolean>>({});

    if (statusEvents.length === 0 && !statusEventsElided && !isCellRunning) {
        return null;
    }

    const toggleRow = (idx: number) => {
        setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
    };

    return (
        <div data-testid="eval-step-list" className="py-1 px-2 my-1 font-mono text-xs space-y-0.5 rounded-lg bg-card/20 border border-border/20">
            {statusEventsElided > 0 ? (
                <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground/60 select-none">
                    <span>… </span>
                    <span>{t('chat.eval.earlierEvents', { count: statusEventsElided })}</span>
                </div>
            ) : null}

            {statusEvents.map((event, idx) => {
                const isLast = idx === statusEvents.length - 1 && !isCellRunning;
                const branch = isLast ? '└── ' : '├── ';
                const hasError = event.hasError === true || Boolean(event.error);
                const isPhase = event.op === 'phase';
                const isAgent = event.op === 'agent';
                const summary = formatEventSummary(event);
                const preview = typeof event.preview === 'string' ? event.preview : (typeof event.output === 'string' ? event.output : null);
                const isExpanded = expandedRows[idx] ?? false;
                const isNewestCompleted = isCellRunning && idx === statusEvents.length - 1;
                const iconName = OP_ICON_MAP[event.op] ?? 'code';

                if (isPhase) {
                    return (
                        <div key={idx} className="pt-1.5 pb-0.5 flex items-center gap-1.5 font-semibold text-foreground text-xs select-none">
                            <span className="text-muted-foreground/50">{branch}</span>
                            <Icon name="flag" className="size-3 text-primary shrink-0" />
                            <span className="truncate">{summary}</span>
                        </div>
                    );
                }

                return (
                    <div key={idx} data-testid="eval-step-row" className="group/step">
                        <div className="flex items-center gap-1.5 py-0.5 hover:bg-interactive-hover/30 rounded px-1 min-w-0">
                            <span className="text-muted-foreground/50 select-none shrink-0">{branch}</span>
                            <span
                                className={cn(
                                    'shrink-0 flex items-center justify-center',
                                    hasError ? 'text-destructive' : (isAgent ? 'text-primary' : 'text-muted-foreground/80')
                                )}
                            >
                                <Icon
                                    name={(hasError ? 'error-warning' : iconName) as React.ComponentProps<typeof Icon>['name']}
                                    className="size-3"
                                />
                            </span>
                            <span
                                className={cn(
                                    'truncate flex-1 min-w-0 select-text',
                                    hasError ? 'text-destructive font-medium' : 'text-foreground/90'
                                )}
                                title={summary}
                            >
                                {summary}
                            </span>
                            {isNewestCompleted ? (
                                <span
                                    data-testid="eval-step-last-completed"
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 font-sans"
                                >
                                    {t('chat.eval.lastCompleted')}
                                </span>
                            ) : null}
                            {preview ? (
                                <button
                                    type="button"
                                    onClick={() => toggleRow(idx)}
                                    className="shrink-0 text-[10px] text-muted-foreground/70 hover:text-foreground px-1 rounded hover:bg-interactive-hover cursor-pointer"
                                >
                                    {isExpanded ? 'Hide' : 'Show preview'}
                                </button>
                            ) : null}
                        </div>

                        {isExpanded && preview ? (
                            <div className="pl-6 pr-2 py-1">
                                <WorkerHighlightedCode
                                    language="text"
                                    code={preview}
                                    style={MINI_CODE_STYLE}
                                    wrap
                                />
                            </div>
                        ) : null}
                    </div>
                );
            })}

            {isCellRunning ? <RunningRow label={t('chat.eval.running')} /> : null}
        </div>
    );
};
