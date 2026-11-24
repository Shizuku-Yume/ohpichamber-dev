import React from 'react';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { SimpleMarkdownRenderer } from '../../../MarkdownRenderer';
import type { ToolPopupContent } from '../../types';
import { STATUS_BADGE_STYLE, type StatusTone } from './shared';

export const StatusBadge: React.FC<{ label: string; tone?: StatusTone; icon?: IconName; testId?: string }> = ({
    label,
    tone = 'neutral',
    icon,
    testId,
}) => (
    <span
        data-testid={testId}
        dir="auto"
        className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 typography-micro font-medium"
        style={STATUS_BADGE_STYLE[tone]}
    >
        {icon ? <Icon name={icon} className="size-3 shrink-0" /> : null}
        <span className="truncate">{label}</span>
    </span>
);

export const ToolMarkdownText: React.FC<{
    content: string;
    variant?: 'tool' | 'reasoning';
    onShowPopup?: (content: ToolPopupContent) => void;
}> = ({ content, variant = 'tool', onShowPopup }) => (
    <SimpleMarkdownRenderer
        content={content}
        variant={variant}
        onShowPopup={onShowPopup}
        fallbackContent={<div className="typography-meta whitespace-pre-wrap break-words text-foreground/90">{content}</div>}
    />
);
