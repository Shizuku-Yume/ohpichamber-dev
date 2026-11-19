import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KNOWLEDGE_ICON_BUTTON_CLASS } from './knowledgeRowStyle';

<<<<<<< HEAD
/** Back to the list, at the start of an opened entry's own toolbar. */
const KnowledgeBackButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
||||||| bc50ba56aa
/** Back to the list, at the start of an opened entry's own toolbar. */
export const KnowledgeBackButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
=======
export const KnowledgeBackButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
>>>>>>> upstream/main
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={onClick}
        className={`${KNOWLEDGE_ICON_BUTTON_CLASS} -ms-1`}
        aria-label={label}
      >
        <Icon name="arrow-left-s" className="h-4 w-4" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" sideOffset={6}>{label}</TooltipContent>
  </Tooltip>
);

export const KnowledgeEntryView: React.FC<{
  backLabel: string;
  showBack?: boolean;
  meta: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ backLabel, showBack = true, meta, actions, onClose, children }) => (
  <div
    className="flex h-full min-h-0 w-full max-w-3xl flex-col"
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      onClose();
    }}
  >
    <div className="flex min-h-7 flex-shrink-0 items-center gap-1.5 pb-2">
      {showBack ? <KnowledgeBackButton label={backLabel} onClick={onClose} /> : null}
      <div className="min-w-0 flex-1">{meta}</div>
      {actions ? <div className="-me-1 flex flex-shrink-0 items-center gap-0.5">{actions}</div> : null}
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </div>
);
