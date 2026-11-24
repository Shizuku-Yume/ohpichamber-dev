import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';
import type { IconName } from '@/components/icon/icons';
import type { ToolPopupContent } from '../../types';

export interface StructuredCardBodyProps {
    input?: JsonObject;
    details?: JsonValue;
    output?: string;
    onShowPopup?: (content: ToolPopupContent) => void;
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export const STATUS_BADGE_STYLE = {
    neutral: {
        color: 'var(--muted-foreground)',
        backgroundColor: 'color-mix(in srgb, var(--surface-muted) 50%, transparent)',
        borderColor: 'var(--border)',
    },
    info: {
        color: 'var(--status-info-text)',
        backgroundColor: 'var(--status-info-background)',
        borderColor: 'var(--status-info-border)',
    },
    success: {
        color: 'var(--status-success-text)',
        backgroundColor: 'var(--status-success-background)',
        borderColor: 'var(--status-success-border)',
    },
    warning: {
        color: 'var(--status-warning-text)',
        backgroundColor: 'var(--status-warning-background)',
        borderColor: 'var(--status-warning-border)',
    },
    error: {
        color: 'var(--status-error-text)',
        backgroundColor: 'var(--status-error-background)',
        borderColor: 'var(--status-error-border)',
    },
};

export const CARD_SHELL_CLASS = 'rounded-xl border border-border/50 bg-[var(--surface-elevated)]/60 p-2.5 space-y-2 text-start';
export const formatFieldLabel = (key: string): string =>
    key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/^./, (char) => char.toUpperCase());

export const formatTokenCount = (count: number): string => count.toLocaleString('en-US');

export const nonEmptyText = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
};

export const inputTextField = (input: JsonObject | undefined, key: string): string | null => {
    if (!input) return null;
    const parsed = z.string().safeParse(input[key]);
    return parsed.success ? nonEmptyText(parsed.data) : null;
};

export const jsonObjectSchema = z.record(z.string(), z.json());
export const jsonArraySchema = z.array(z.json());

const STATE_TONE_MAP = new Map<string, StatusTone>(
    Object.entries({
        success: 'success',
        complete: 'success',
        completed: 'success',
        validated: 'success',
        passed: 'success',
        apply: 'success',
        applied: 'success',
        neutral: 'success',
        skipped: 'success',
        failure: 'error',
        failed: 'error',
        error: 'error',
        aborted: 'error',
        timed_out: 'error',
        cancelled: 'error',
        canceled: 'error',
        rejected: 'error',
        action_required: 'error',
        startup_failure: 'error',
        paused: 'warning',
        partial: 'warning',
        'budget-limited': 'warning',
        stopped: 'warning',
        warning: 'warning',
        discard: 'warning',
        discarded: 'warning',
        queued: 'warning',
        waiting: 'warning',
        pending: 'warning',
        requested: 'warning',
        running: 'info',
        active: 'info',
        in_progress: 'info',
        watching: 'info',
        preparing: 'info',
        reviewing: 'info',
        publishing: 'info',
    } satisfies Record<string, StatusTone>),
);

const STATE_ICON_MAP = new Map<string, IconName>(
    Object.entries({
        success: 'checkbox-circle',
        complete: 'checkbox-circle',
        completed: 'checkbox-circle',
        validated: 'checkbox-circle',
        passed: 'checkbox-circle',
        apply: 'checkbox-circle',
        applied: 'checkbox-circle',
        skipped: 'checkbox-circle',
        failure: 'close-circle',
        failed: 'close-circle',
        error: 'close-circle',
        aborted: 'close-circle',
        timed_out: 'close-circle',
        cancelled: 'close-circle',
        canceled: 'close-circle',
        rejected: 'close-circle',
        action_required: 'close-circle',
        startup_failure: 'close-circle',
        running: 'record-circle',
        active: 'record-circle',
        in_progress: 'record-circle',
        watching: 'record-circle',
        preparing: 'record-circle',
        reviewing: 'record-circle',
        publishing: 'record-circle',
        queued: 'time',
        waiting: 'time',
        pending: 'time',
        requested: 'time',
        paused: 'time',
        stopped: 'time',
    } satisfies Record<string, IconName>),
);

export const statusToneForState = (value: string | undefined): StatusTone => {
    const normalized = value?.trim().toLowerCase();
    return normalized ? (STATE_TONE_MAP.get(normalized) ?? 'neutral') : 'neutral';
};

export const statusIconForState = (value: string | undefined): IconName => {
    const normalized = value?.trim().toLowerCase();
    return normalized ? (STATE_ICON_MAP.get(normalized) ?? 'information') : 'information';
};
