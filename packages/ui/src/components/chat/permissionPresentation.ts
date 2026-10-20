import type { ApprovalRequest } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import type { IconName } from '@/components/icon/icons';

type ApprovalPresentation = {
  titleKey: I18nKey;
  icon: IconName;
};

/** The native action type names the operation; the tool name stays the subject. */
export const getApprovalPresentation = (permission: ApprovalRequest): ApprovalPresentation => {
  switch (permission.actionType) {
    case 'bash_command':
      return { titleKey: 'chat.permissionCard.summary.shell', icon: 'terminal-box' };
    case 'file_write':
      return { titleKey: 'chat.permissionCard.summary.edit', icon: 'file-edit' };
    case 'network_request':
      return { titleKey: 'chat.permissionCard.summary.webfetch', icon: 'global' };
    default:
      return { titleKey: 'chat.permissionCard.summary.tool', icon: 'tools' };
  }
};

/** The exact scope a session allowance would save, shown on its button. */
export const getApprovalPolicyTitle = (permission: ApprovalRequest): string | undefined => {
  if (!permission.policyTarget) return undefined;
  return `${permission.policyTarget.toolName}: ${permission.policyTarget.pattern}`;
};
