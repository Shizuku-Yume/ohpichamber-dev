import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { UpdateDialog } from '@/components/ui/UpdateDialog';
import { useI18n } from '@/lib/i18n';
import { isElectronShell } from '@/lib/desktop';
import { formatDateTimeForPreference } from '@/lib/timeFormat';
import { useUIStore } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import {
  SettingsSection,
  SettingsFieldRow,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';

const valueRow = { alignEnd: false, controlClassName: 'min-h-8 flex-wrap @xl:flex-initial' } as const;

export const AboutUpdatesSection: React.FC = () => {
  const { t } = useI18n();
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
  const update = useUpdateStore(useShallow((s) => ({
    checking: s.checking,
    available: s.available,
    downloading: s.downloading,
    downloaded: s.downloaded,
    installing: s.installing,
    info: s.info,
    progress: s.progress,
    error: s.error,
    lastChecked: s.lastChecked,
    checkForUpdates: s.checkForUpdates,
    downloadUpdate: s.downloadUpdate,
    restartToUpdate: s.restartToUpdate,
  })));
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (!isElectronShell()) return null;

  const offeredVersion = update.info?.version ?? '';
  const statusText = update.checking
    ? t('settings.openchamber.about.updates.state.checking')
    : update.error !== null
      ? update.error
      : update.downloading
        ? t('settings.openchamber.about.updates.state.downloading')
        : update.downloaded
          ? t('settings.openchamber.about.updates.state.readyToInstall')
          : update.available
            ? t('settings.openchamber.about.updates.state.available', { version: offeredVersion })
            : update.lastChecked !== null
              ? t('settings.openchamber.about.updates.state.upToDate')
              : t('settings.openchamber.about.updates.state.notChecked');

  const lastCheckedText = update.lastChecked === null
    ? t('settings.openchamber.about.updates.state.never')
    : formatDateTimeForPreference(update.lastChecked, timeFormatPreference, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <SettingsSection
      title={t('settings.openchamber.about.updates.title')}
      headerAction={(
        <Button
          size="sm"
          variant="outline"
          disabled={update.checking || update.downloading || update.installing}
          onClick={() => void update.checkForUpdates()}
        >
          {t('settings.openchamber.about.actions.checkUpdates')}
        </Button>
      )}
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      <div>
        <SettingsFieldRow label={t('settings.openchamber.about.updates.field.status')} {...valueRow}>
          <span className="typography-meta text-muted-foreground">{statusText}</span>
          {(update.available || update.downloaded) && !update.checking ? (
            <Button size="sm" variant="default" onClick={() => setDialogOpen(true)}>
              {t('settings.openchamber.about.updates.actions.update')}
            </Button>
          ) : null}
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.openchamber.about.updates.field.lastChecked')} {...valueRow}>
          <span className="typography-meta font-mono text-muted-foreground">{lastCheckedText}</span>
        </SettingsFieldRow>
      </div>

      <UpdateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        info={update.info}
        downloading={update.downloading}
        downloaded={update.downloaded}
        installing={update.installing}
        progress={update.progress}
        error={update.error}
        onDownload={update.downloadUpdate}
        onRestart={update.restartToUpdate}
      />
    </SettingsSection>
  );
};
