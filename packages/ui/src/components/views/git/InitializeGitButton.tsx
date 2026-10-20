import React from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGitStore } from '@/stores/useGitStore';

import { canOfferGitInitialization } from './gitInitialization';

type InitializeGitButtonProps = {
  directory: string;
};

export const InitializeGitButton: React.FC<InitializeGitButtonProps> = ({ directory }) => {
  const { t } = useI18n();
  const { git } = useRuntimeAPIs();
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const recheckRepository = useGitStore((state) => state.recheckRepository);
  const [busy, setBusy] = React.useState(false);

  if (!canOfferGitInitialization(directory, homeDirectory)) return null;

  const initialize = async () => {
    setBusy(true);
    try {
      await git.initializeGit(directory);
    } catch (error) {
      setBusy(false);
      toast.error(t('gitView.toast.initializeGitFailed'), { description: error instanceof Error ? error.message : undefined });
      return;
    }
    // On success this empty state unmounts as the Git surface takes over.
    const isRepository = await recheckRepository(directory, git);
    if (!isRepository) {
      setBusy(false);
      toast.error(t('gitView.toast.initializeGitNotDetected'));
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-3 gap-1.5"
      disabled={busy}
      onClick={() => void initialize()}
    >
      {busy ? <Icon name="loader-4" className="size-4 animate-spin" /> : null}
      {t('gitView.empty.initializeGit')}
    </Button>
  );
};
