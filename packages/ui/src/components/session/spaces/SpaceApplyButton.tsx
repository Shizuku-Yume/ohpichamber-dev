/**
<<<<<<< HEAD
 * The button in the desktop session header that opens the apply dialog of the space the open
 * session works in (DESIGN.md, user journey step 6): the person looks at the chat when the agent
 * is done, not at the sidebar. The phone reaches the same dialog from the group's sheet. Nothing
 * for a host directory, while the feature is off, or in VS Code (decision 16).
=======
 * "Apply changes" in the Git panel of an isolated space (journey step 6): the panel where the
 * user reads the space's diff is where its work goes back to the project, as a branch or as
 * uncommitted changes, through the apply dialog. The space's row menu in the sidebar and the
 * phone's actions sheet open the same dialog. Nothing for a host directory, while the feature is
 * off, or in VS Code (decision 16).
>>>>>>> bc50ba56a
 */

import React from 'react';

import { Icon } from '@/components/icon/Icon';
<<<<<<< HEAD
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
=======
import { Button } from '@/components/ui/button';
import { ButtonTooltip } from '@/components/ui/action-toolbar';
import { isVSCodeRuntime } from '@/lib/desktop';
>>>>>>> bc50ba56a
import { useI18n } from '@/lib/i18n';
import { isSpaceApplicable } from '@/lib/spaces/space-repair';
import { spaceIdOfDirectory } from '@/lib/spaces/space-route';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { useUIStore } from '@/stores/useUIStore';

<<<<<<< HEAD
export const SpaceApplyButton: React.FC<{
  directory: string | null | undefined;
  /** Sizing and colour of the button where it sits; the tooltip still names it. */
  className?: string;
  iconClassName?: string;
}> = ({ directory, className = '', iconClassName = '' }) => {
=======
export const SpaceApplyButton: React.FC<{ directory: string | null | undefined }> = ({ directory }) => {
>>>>>>> bc50ba56a
  const { t } = useI18n();
  const enabled = useUIStore((state) => state.isolatedSpacesEnabled);
  const spaceId = spaceIdOfDirectory(directory);
  const applicable = useSpacesStore((state) => isSpaceApplicable(spaceId ? state.journey?.get(spaceId) : undefined));
  // As the row's menu: nothing new starts while another action on the space runs.
  const busy = useSpacesStore((state) => (spaceId ? state.actions.get(spaceId)?.kind === 'running' : false));
<<<<<<< HEAD
  if (!enabled || !spaceId || !applicable) return null;
  const label = t('spaces.header.apply');
=======
  if (!enabled || !spaceId || !applicable || isVSCodeRuntime()) return null;
  const label = t('spaces.gitPanel.apply');
  // A narrow panel hides the word (`.space-apply__label` in index.css); the tooltip says what it does.
>>>>>>> bc50ba56a
  return (
    <ButtonTooltip label={t('contextTooltips.git.spaceApply')} side="bottom" className="shrink-0">
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" aria-label={label} disabled={busy} onClick={() => useSpacesStore.getState().openApplyDialog(spaceId)}>
        <Icon name="git-merge" className="size-3.5" />
        <span className="space-apply__label">{label}</span>
      </Button>
    </ButtonTooltip>
  );
};
