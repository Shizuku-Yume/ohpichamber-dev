import { usePermissionFromSubagent, usePermissionResponse, type PermissionResponse } from './usePermissionResponse';
import React from 'react';
import { z } from 'zod';
import type { ApprovalRequest } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { HighlightedCode } from '@/components/code/HighlightedCode';
import { useI18n } from '@/lib/i18n';
import { PermissionActions } from './PermissionActions';
import { getApprovalPolicyTitle, getApprovalPresentation, isToolScopePolicy, truncateApprovalTarget } from './permissionPresentation';

const PERMISSION_CODE_STYLE: React.CSSProperties = {
    margin: 0,
    padding: '0.5rem',
    fontSize: 'var(--text-meta)',
    lineHeight: '1.25rem',
    background: 'color-mix(in srgb, var(--surface-muted) 30%, transparent)',
    borderRadius: '0.25rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    overflow: 'visible',
};

const CODE_TAG_STYLE: React.CSSProperties = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
};

// The native approval request owns `details` as a JSON object. Project the
// fields the card renders instead of inspecting JSON values by hand; a raw
// input is never rendered, even if an older event carried one.
const ApprovalDetailsSchema = z.object({
    reason: z.string().optional(),
    command: z.string().optional(),
    path: z.string().optional(),
});

/** Summary, safe input preview and the reduced details disclosure. */
export const PermissionRequestContent: React.FC<{ permission: ApprovalRequest }> = ({ permission }) => {
    const { t } = useI18n();
    const presentation = getApprovalPresentation(permission);
    const details = ApprovalDetailsSchema.safeParse(permission.details);
    const reason = details.success ? details.data.reason : undefined;
    const command = details.success ? details.data.command : undefined;
    const path = details.success ? details.data.path : undefined;
    const preview = command ?? path;
    const summaryTitle = presentation.titleKey === 'chat.permissionCard.summary.tool'
        ? t(presentation.titleKey, { tool: permission.toolName })
        : t(presentation.titleKey);
    const safeDetails: Record<string, string> = {};
    if (reason) safeDetails.reason = reason;
    if (command) safeDetails.command = command;
    if (path) safeDetails.path = path;
    const hasDetails = Object.keys(safeDetails).length > 0;
    const policyPattern = permission.policyTarget?.pattern;
    const toolScopePolicy = isToolScopePolicy(permission);
    const shownPolicyPattern = policyPattern === undefined || toolScopePolicy
        ? undefined
        : truncateApprovalTarget(policyPattern);
    const alwaysAllowLabel = t('chat.permissionCard.alwaysAllow', { tool: permission.toolName });
    const policyTitle = getApprovalPolicyTitle(permission);

    return (
        <div className="px-2 py-2">
            {/* The agent explains in its own words why it needs the operation. */}
            {reason ? (
                <div className="typography-meta text-foreground/80 mb-2 whitespace-pre-wrap break-words">
                    {reason}
                </div>
            ) : null}

            <div className="mb-2">
                <div className="typography-meta font-medium text-foreground">{summaryTitle}</div>
                {permission.commandSummary ? (
                    <div className="typography-meta mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {permission.commandSummary}
                    </div>
                ) : null}
            </div>

            {permission.policyTarget ? (
                <div className="typography-meta text-muted-foreground mb-2">
                    <span className="font-semibold">{alwaysAllowLabel}</span>{' '}
                    {shownPolicyPattern ? (
                        <code className="px-1 py-0.5 bg-muted/30 rounded break-all" title={policyTitle}>{shownPolicyPattern}</code>
                    ) : null}
                </div>
            ) : null}

            {preview ? (
                <div className="mb-2">
                    <ScrollableOverlay outerClassName="max-h-[60vh]" className="tool-output-surface p-1 rounded-xl border border-edge-muted bg-transparent">
                        <HighlightedCode
                            language={command ? 'bash' : 'json'}
                            code={preview}
                            style={PERMISSION_CODE_STYLE}
                            codeStyle={CODE_TAG_STYLE}
                            wrap
                        />
                    </ScrollableOverlay>
                </div>
            ) : null}

            {hasDetails ? (
                <details className="group">
                    <summary className="typography-meta flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <Icon name="arrow-right-s" className="size-3.5 transition-transform group-open:rotate-90" />
                        {t('chat.permissionCard.showDetails')}
                    </summary>
                    <ScrollableOverlay outerClassName="mt-1 max-h-48" className="p-0">
                        <pre className="typography-meta font-mono px-2 py-1 bg-muted/30 rounded whitespace-pre-wrap break-all">
                            {JSON.stringify(safeDetails, null, 2)}
                        </pre>
                    </ScrollableOverlay>
                </details>
            ) : null}
        </div>
    );
};

/** Allow once / session allowance / deny, with the original dock and inline layouts. */
export { PermissionActions };

interface PermissionCardProps {
  permission: ApprovalRequest;
  onResponse?: (response: PermissionResponse) => void;
}

export const PermissionCard: React.FC<PermissionCardProps> = ({ permission, onResponse }) => {
  const { t } = useI18n();
  const { isResponding, hasResponded, respond } = usePermissionResponse(permission, onResponse);
  const isFromSubagent = usePermissionFromSubagent(permission);
  const tool = getApprovalPresentation(permission);

  if (hasResponded) {
    return null;
  }

  return (
    <div className="group w-full pt-0 pb-2">
      <div className="chat-column">
        <div className="-mt-1 border border-edge-muted rounded-xl bg-muted/10">
          <div className="px-2 py-1.5 border-b border-edge-muted bg-muted/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="question" className="h-3.5 w-3.5 text-[var(--status-warning)]" />
                <span className="typography-meta font-medium text-muted-foreground">
                  {t('chat.permissionCard.title')}
                </span>
                {isFromSubagent ? (
                  <span className="typography-micro text-muted-foreground px-1.5 py-0.5 rounded bg-foreground/5">
                    {t('chat.questionCard.fromSubagent')}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <Icon name={tool.icon} className="h-3 w-3" />
                <span dir="auto" className="typography-meta text-muted-foreground font-medium">{t(tool.titleKey)}</span>
              </div>
            </div>
          </div>

          <PermissionRequestContent permission={permission} />

          <PermissionActions permission={permission} isResponding={isResponding} onRespond={(response) => void respond(response)} variant="inline" />
        </div>
      </div>
    </div>
  );
};
