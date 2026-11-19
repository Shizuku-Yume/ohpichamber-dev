import React from 'react';
import { useI18n } from '@/lib/i18n';

<<<<<<< HEAD
type Props = {
  /** The committed sidebar query that matched nothing. */
  query: string;
  /** Whether the Archive page is available here. */
  showArchive: boolean;
  resetSessionSearch: () => void;
};

/** The sidebar's no-match state, with a way to continue the same search in the Archive. */
export function SidebarSearchEmptyState({ query, showArchive, resetSessionSearch }: Props): React.ReactNode {
||||||| bc50ba56aa
type Props = {
  /** The committed sidebar query that matched nothing. */
  query: string;
  /** Whether the Archive page exists here; VS Code keeps its archive inline. */
  showArchive: boolean;
  resetSessionSearch: () => void;
};

/** The sidebar's no-match state, with a way to continue the same search in the Archive. */
export function SidebarSearchEmptyState({ query, showArchive, resetSessionSearch }: Props): React.ReactNode {
=======
export function SidebarSearchEmptyState(): React.ReactNode {
>>>>>>> upstream/main
  const { t } = useI18n();
  return (
    <div className="py-6 text-center text-muted-foreground">
      <p className="typography-ui-label font-semibold">{t('sessions.sidebar.empty.noMatches.title')}</p>
      <p className="typography-meta mt-1">{t('sessions.sidebar.empty.noMatches.description')}</p>
    </div>
  );
}
