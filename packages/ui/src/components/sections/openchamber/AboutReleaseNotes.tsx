import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { SETTINGS_SECTION_TITLE_CLASS, SettingsSection } from '@/components/sections/shared/SettingsSection';
import { fetchReleaseNotes, formatReleaseDate, type ReleaseNotesRelease } from '@/components/update/releaseNotes';
import { ReleaseNotesBody } from '@/components/update/ReleaseNotesBody';
import { useI18n } from '@/lib/i18n';

const GITHUB_RELEASES_URL = 'https://github.com/openchamber/openchamber/releases';

const TITLE_KEYS = {
  installed: {
    current: 'settings.openchamber.about.releaseNotes.current',
    since: 'settings.openchamber.about.releaseNotes.since',
  },
  app: {
    current: 'settings.openchamber.about.releaseNotes.app.current',
    since: 'settings.openchamber.about.releaseNotes.app.since',
  },
  server: {
    current: 'settings.openchamber.about.releaseNotes.server.current',
    since: 'settings.openchamber.about.releaseNotes.server.since',
  },
} as const;

type ReleaseCardProps = {
  release: ReleaseNotesRelease;
  label: { version: string; date: string | null } | null;
};

const ReleaseCard: React.FC<ReleaseCardProps> = ({ release, label }) => (
  <div className="oc-tile rounded-lg p-4">
    {label && (
      <div className="mb-3 flex items-center gap-3">
        <span className="typography-ui-label rounded bg-[var(--primary-base)]/10 px-1.5 py-0.5 font-mono text-[var(--primary-base)]">
          {label.version}
        </span>
        {label.date && <span className="typography-meta text-muted-foreground">{label.date}</span>}
      </div>
    )}
    <ReleaseNotesBody notes={release} folded={label !== null} />
  </div>
);

type AboutReleaseNotesProps = {
  version: string;
  since: string | null;
  describeVersion: (version: string, beside?: string | null) => string;
  owner: keyof typeof TITLE_KEYS;
};

export const AboutReleaseNotes: React.FC<{ version: string | null }> = ({ version, owner }) => {
  const { t } = useI18n();
  const [releases, setReleases] = React.useState<ReleaseNotesRelease[] | null>(null);

  React.useEffect(() => {
    if (!version) return;
    const controller = new AbortController();
    void fetchReleaseNotes(version, null, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setReleases(loaded);
    });
    return () => controller.abort();
  }, [version]);

  if (!releases || releases.length === 0) return null;

  const single = releases.length === 1 ? releases[0] : null;
  const showDate = single && !since && !parseCanaryVersion(single.version);
  const canaries = releases.map((release) => parseCanaryVersion(release.version));
  const labelOf = (release: ReleaseNotesRelease, index: number): ReleaseCardProps['label'] => {
    const canary = canaries[index];
    if (!canary) return { version: `v${release.version}`, date: formatReleaseDate(release.date) };
    const sameDay = canaries.find((other, otherIndex) => otherIndex !== index && other?.builtOn.getTime() === canary.builtOn.getTime());
    return { version: t('updateDialog.canary.night', { date: formatCanaryBuild(canary, getCurrentIntlLocale(), sameDay) }), date: null };
  };
  return (
    <SettingsSection
      title={(
        <h2 className={SETTINGS_SECTION_TITLE_CLASS}>
          {since
            ? t(TITLE_KEYS[owner].since, { version: describeVersion(since, version) })
            : t(TITLE_KEYS[owner].current, { version: version ?? '' })}
          {single && <span className="typography-meta whitespace-nowrap text-muted-foreground"> · {formatReleaseDate(single.date)}</span>}
        </h2>
      )}
      headerAction={(
        <a
          href={GITHUB_RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 typography-meta text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('settings.openchamber.about.releaseNotes.allReleases')}
          <Icon name="external-link" className="size-3.5" />
        </a>
      )}
    >
      {releases.map((release) => (
        <div key={release.version} className="oc-tile rounded-lg p-4">
          <ReleaseNotesBody notes={release} folded={false} />
        </div>
      ))}
    </SettingsSection>
  );
};
