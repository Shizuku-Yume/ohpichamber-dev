import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { SessionMenuItemHint } from './SessionMenuItemHint';
import { useI18n } from '@/lib/i18n';
import { useSessionAiRenameAction } from './useSessionAiRenameAction';

export function SessionAiRenameMenuItem({ sessionID, directory, open, Item }: {
  sessionID: string;
  directory: string | null | undefined;
  open: boolean;
  Item: React.ElementType;
}) {
  const { t } = useI18n();
  const { pending, disabled, hint, run } = useSessionAiRenameAction(sessionID, directory, open);

  return (
    <SessionMenuItemHint hint={hint}>
      <span className="block">
        <Item
          disabled={disabled}
          onClick={run}
          className="w-full"
        >
<<<<<<< HEAD
          {/* ai-generate-2 ink fills ~22/24 of the viewBox vs 20/24 for
              sibling Remixicons, so it renders optically larger at size-4. */}
          <Icon name={pending ? 'loader-4' : 'ai-generate-2'} className={pending ? 'mr-1 size-4 animate-spin' : 'mr-1 size-[15px]'} />
||||||| bc50ba56aa
          {/* ai-generate-2 ink fills ~22/24 of the viewBox vs 20/24 for
              sibling Remixicons, so it renders optically larger at size-4. */}
          <Icon name={pending ? 'loader-4' : 'ai-generate-2'} className={pending ? 'me-1 size-4 animate-spin' : 'me-1 size-[15px]'} />
=======
          <span className="me-1 inline-flex size-3.5 shrink-0 items-center justify-center">
            <Icon name={pending ? 'loader-4' : 'ai-generate-2'} className={pending ? 'size-3.5 animate-spin' : 'size-[13px]'} />
          </span>
>>>>>>> upstream/main
          {t('sessions.aiRename.action')}
        </Item>
      </span>
    </SessionMenuItemHint>
  );
}
