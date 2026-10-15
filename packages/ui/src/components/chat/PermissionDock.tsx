import React from 'react';
import { AnimatePresence } from 'motion/react';
import type { ApprovalRequest } from '@openchamber/agent-contract';
import { ComposerFloatingPanel } from './composer/ui/ComposerFloatingPanel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useScopedBlockingPermissions } from '@/sync/sync-context';
import { useRequestReveal } from '@/sync/request-reveal';
import { respondToPermission } from '@/sync/session-actions';

export const CanonicalApprovalCard: React.FC<{ permission: ApprovalRequest }> = ({ permission }) => {
    const { t } = useI18n();
    const [pending, setPending] = React.useState(false);
    const respond = async (response: 'once' | 'always' | 'reject') => {
        setPending(true);
        try { await respondToPermission(permission.sessionId, permission.approvalId, response); }
        catch { toast.error(t('chat.formCard.submitFailed'), { description: t('chat.formCard.tryAgain') }); }
        finally { setPending(false); }
    };
    return <div className="space-y-3 p-3">
        <div className="typography-meta text-muted-foreground">{permission.toolName}</div>
        <div className="whitespace-pre-wrap">{permission.commandSummary}</div>
        <details><summary>{t('chat.permissionCard.showDetails')}</summary><pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(permission.details, null, 2)}</pre></details>
        <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => void respond('once')}>{t('chat.permissionCard.allowOnce')}</Button>
            {permission.policyTarget ? <Button size="sm" disabled={pending} onClick={() => void respond('always')}>{t('chat.permissionCard.alwaysAllow')}</Button> : null}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void respond('reject')}>{t('chat.permissionCard.deny')}</Button>
        </div>
    </div>;
};
interface PermissionDockProps { sessionId: string | null; directory?: string; hidden: boolean }
const PermissionDockView: React.FC<PermissionDockProps> = ({ sessionId, directory, hidden }) => {
    const { t } = useI18n();
    const permissions = useScopedBlockingPermissions(sessionId, directory);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [collapsed, setCollapsed] = React.useState(false);
    const ids = React.useMemo(() => permissions.map((permission) => permission.approvalId), [permissions]);
    useRequestReveal(ids, React.useCallback((id: string) => { setSelectedId(id); setCollapsed(false); }, []));
    const current = permissions.find((permission) => permission.approvalId === selectedId) ?? permissions[0];
    return <AnimatePresence>{hidden || !current ? null : <ComposerFloatingPanel
        role="dialog" ariaLabel={t('chat.permissionCard.title')} compact={collapsed}
        header={<button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{t('chat.permissionCard.title')}</button>}
    >{collapsed ? null : <div className="max-h-[50vh] overflow-y-auto">
        {permissions.length > 1 ? <div role="tablist" className="flex gap-2">{permissions.map((permission, index) => <button key={permission.approvalId} type="button" role="tab" aria-selected={permission.approvalId === current.approvalId} onClick={() => setSelectedId(permission.approvalId)} aria-label={t('chat.permissionDock.stepAria', { index: String(index + 1), tool: permission.toolName })}>{index + 1}</button>)}</div> : null}
        <CanonicalApprovalCard key={current.approvalId} permission={current} />
    </div>}</ComposerFloatingPanel>}</AnimatePresence>;
};
export const PermissionDock = React.memo(PermissionDockView);
