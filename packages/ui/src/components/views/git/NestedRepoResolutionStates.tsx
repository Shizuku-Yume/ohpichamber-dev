import React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import type { NestedRepoDiscovery } from '@/stores/useGitStore';

import { InitializeGitButton } from './InitializeGitButton';

type NestedRepoResolutionStatesProps = {
  root: string | null;
  rootIsGitRepo: boolean | null;
  resolvedIsGitRepo: boolean | null;
  nestedRepos: NestedRepoDiscovery | undefined;
  onRetryDiscovery: () => void;
  emptyStateFooter?: React.ReactNode;
};

<<<<<<< HEAD
/**
 * Shared empty/loading states for git surfaces while nested-repository
 * resolution is pending, failed, or impossible. Renders null once resolution
 * has finished — either the root is a repository or the operating directory
 * probed as one — so the consumer can proceed into its own content.
 *
 * A runtime without the discovery route reports "unsupported": the
 * honest state there is the plain not-a-repository empty state, without a
 * retry that can never succeed.
 */
||||||| bc50ba56aa
/**
 * Shared empty/loading states for git surfaces while nested-repository
 * resolution is pending, failed, or impossible. Renders null once resolution
 * has finished — either the root is a repository or the operating directory
 * probed as one — so the consumer can proceed into its own content.
 *
 * A runtime without the discovery route (VS Code) reports "unsupported": the
 * honest state there is the plain not-a-repository empty state, without a
 * retry that can never succeed.
 */
=======
>>>>>>> upstream/main
export const NestedRepoResolutionStates: React.FC<NestedRepoResolutionStatesProps> = ({
  root,
  rootIsGitRepo,
  resolvedIsGitRepo,
  nestedRepos,
  onRetryDiscovery,
  emptyStateFooter,
}) => {
  const { t } = useI18n();

  if (rootIsGitRepo !== false) return null;
  if (resolvedIsGitRepo === true) return null;

  if (nestedRepos === undefined || nestedRepos === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <Icon name="loader-4" className="mb-3 size-6 animate-spin text-muted-foreground" />
        <p className="typography-ui-label font-semibold text-foreground">
          {nestedRepos === null
            ? t('gitView.empty.discoverFailed')
            : t('gitView.empty.discoveringRepositories')}
        </p>
        {nestedRepos === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={onRetryDiscovery}
          >
            <Icon name="refresh" className="size-4" />
            {t('gitView.empty.retryDiscovery')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (nestedRepos === 'unsupported' || nestedRepos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <Icon name="git-branch" className="mb-3 size-6 text-muted-foreground" />
        <p className="typography-ui-label font-semibold text-foreground">
          {t('gitView.empty.notGitRepository')}
        </p>
        <p className="typography-meta mt-1 text-muted-foreground">
          {t('gitView.empty.notGitRepositoryDescription')}
        </p>
        {root ? <InitializeGitButton directory={root} /> : null}
        {emptyStateFooter}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <Icon name="loader-4" className="mb-3 size-6 animate-spin text-muted-foreground" />
      <p className="typography-ui-label font-semibold text-foreground">
        {t('gitView.loading.checkingRepository')}
      </p>
    </div>
  );
};
