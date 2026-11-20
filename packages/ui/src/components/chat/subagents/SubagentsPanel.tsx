import React from 'react';

import { WorkStatusSubagentsSection } from '@/components/chat/work-status/WorkStatusSubagentsSection';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useI18n } from '@/lib/i18n';
import { useSessionUIStore } from '@/sync/session-ui-store';

/**
 * Context-panel subagents tab. It shows the shown session's Canonical
 * subagent records through the work-status subagents section.
 */
export const SubagentsPanel: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();
  const sessionId = useSessionUIStore((state) => state.currentSessionId);

  if (!sessionId) {
    return <p className="px-4 py-6 typography-meta text-muted-foreground">{t('subagents.panel.empty')}</p>;
  }

  return (
    <ScrollableOverlay outerClassName="h-full" className="px-3 py-2">
      <WorkStatusSubagentsSection sessionId={sessionId} directory={directory} />
    </ScrollableOverlay>
  );
};
