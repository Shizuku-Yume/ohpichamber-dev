import React from 'react';
import type { ApprovalRequest } from '@openchamber/agent-contract';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { formatShortcutForDisplay } from '@/lib/shortcuts';
import type { PermissionResponse } from './usePermissionResponse';
import { getApprovalPolicyTitle } from './permissionPresentation';

/**
 * The native approval decisions. "Always allow" is the session-scoped
 * decision and exists only when the request carries a policy target; the Host
 * keeps the authorization decision. Inline cards keep the status-coloured row;
 * the dock uses the shared buttons.
 */
export const PermissionActions: React.FC<{
    permission: ApprovalRequest;
    isResponding: boolean;
    onRespond: (response: PermissionResponse) => void;
    variant: 'inline' | 'dock';
}> = ({ permission, isResponding, onRespond, variant }) => {
    const { t } = useI18n();
    const hasSessionAllow = permission.policyTarget !== undefined;
    const alwaysTitle = getApprovalPolicyTitle(permission);

    if (variant === 'dock') {
        return (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-1">
                <Button variant="ghost" size="xs" disabled={isResponding} onClick={() => onRespond('reject')} className="text-[var(--status-error)]">
                    <Icon name="close" className="size-3.5" />
                    {t('chat.permissionCard.deny')}
                    <kbd className="ml-1 hidden sm:inline typography-micro opacity-60">{formatShortcutForDisplay('alt+backspace')}</kbd>
                </Button>
                <div className="min-w-0 flex-1" />
                {hasSessionAllow ? (
                    <Button variant="outline" size="xs" disabled={isResponding} onClick={() => onRespond('always')} title={alwaysTitle}>
                        <Icon name="time" className="size-3.5" />
                        <span className="max-w-[180px] truncate">{t('chat.permissionCard.alwaysAllow')}</span>
                        <kbd className="ml-1 hidden sm:inline typography-micro opacity-60">{formatShortcutForDisplay('alt+shift+enter')}</kbd>
                    </Button>
                ) : null}
                <Button size="xs" disabled={isResponding} onClick={() => onRespond('once')}>
                    {isResponding ? <Icon name="loader-4" className="size-3.5 animate-spin" /> : <Icon name="check" className="size-3.5" />}
                    {t('chat.permissionCard.allowOnce')}
                    <kbd className="ml-1 hidden sm:inline typography-micro opacity-60">{formatShortcutForDisplay('alt+enter')}</kbd>
                </Button>
            </div>
        );
    }

    const rowClass = cn(
        'flex items-center gap-1.5 sm:gap-1 px-3 sm:px-2 py-1.5 sm:py-1 typography-meta font-medium rounded transition-all min-h-[32px] sm:min-h-0 w-full sm:w-auto',
        'disabled:opacity-50 disabled:cursor-not-allowed',
    );
    const hover = (idle: string, active: string) => ({
        onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => { event.currentTarget.style.backgroundColor = active; },
        onMouseLeave: (event: React.MouseEvent<HTMLButtonElement>) => { event.currentTarget.style.backgroundColor = idle; },
    });

    return (
        <div className="px-2 pb-2 sm:pb-1.5 pt-1.5 sm:pt-1 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-1.5 border-t border-border/20">
            <button
                type="button"
                onClick={() => onRespond('once')}
                disabled={isResponding}
                className={rowClass}
                style={{ backgroundColor: 'rgb(var(--status-success) / 0.1)', color: 'var(--status-success)' }}
                {...hover('rgb(var(--status-success) / 0.1)', 'rgb(var(--status-success) / 0.2)')}
            >
                <Icon name="check" className="h-3.5 w-3.5 sm:h-3 sm:w-3 flex-shrink-0" />
                {t('chat.permissionCard.allowOnce')}
                <kbd className="ml-1 hidden sm:inline typography-micro opacity-60">{formatShortcutForDisplay('alt+enter')}</kbd>
            </button>

            {hasSessionAllow ? (
                <button
                    type="button"
                    onClick={() => onRespond('always')}
                    disabled={isResponding}
                    title={alwaysTitle}
                    className={rowClass}
                    style={{ backgroundColor: 'rgb(var(--muted) / 0.5)', color: 'var(--muted-foreground)' }}
                    {...hover('rgb(var(--muted) / 0.5)', 'rgb(var(--muted) / 0.7)')}
                >
                    <Icon name="time" className="h-3.5 w-3.5 sm:h-3 sm:w-3 flex-shrink-0" />
                    <span className="truncate max-w-[180px]">{t('chat.permissionCard.alwaysAllow')}</span>
                    <kbd className="ml-1 hidden sm:inline typography-micro opacity-60">{formatShortcutForDisplay('alt+shift+enter')}</kbd>
                </button>
            ) : null}

            <button
                type="button"
                onClick={() => onRespond('reject')}
                disabled={isResponding}
                className={rowClass}
                style={{ backgroundColor: 'rgb(var(--status-error) / 0.1)', color: 'var(--status-error)' }}
                {...hover('rgb(var(--status-error) / 0.1)', 'rgb(var(--status-error) / 0.2)')}
            >
                <Icon name="close" className="h-3.5 w-3.5 sm:h-3 sm:w-3 flex-shrink-0" />
                {t('chat.permissionCard.deny')}
                <kbd className="ml-1 hidden sm:inline typography-micro opacity-60">{formatShortcutForDisplay('alt+backspace')}</kbd>
            </button>

            {isResponding ? (
                <div className="flex justify-center w-full sm:w-auto sm:ml-auto py-1 sm:py-0 typography-meta text-muted-foreground">
                    <div className="animate-spin h-3 w-3 border border-primary border-t-transparent rounded-full" />
                </div>
            ) : null}
        </div>
    );
};
