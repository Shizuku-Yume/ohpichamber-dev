import React from 'react';
import { z } from 'zod';
import { AboutLogo } from '@/components/ui/AboutLogo';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useDesktopRemoteHostActive } from '@/hooks/useDesktopRemoteHostActive';
import { getDesktopAppVersion } from '@/lib/desktopNative';
import { InstanceServiceUrls } from './InstanceServiceUrls';
import { AboutReleaseNotes } from './AboutReleaseNotes';
import { AboutUpdatesSection } from './AboutUpdatesSection';
import {
  SettingsSection,
  SettingsFieldRow,
  SETTINGS_BRAND_TITLE_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';

const GITHUB_URL = 'https://github.com/Shizuku-Yume/ohpichamber';
const UPSTREAM_GITHUB_URL = 'https://github.com/openchamber/openchamber';
const MAINTAINER_URL = 'https://github.com/Shizuku-Yume';

const SystemInfoSchema = z.object({
  openchamberVersion: z.string().min(1).nullish(),
  ompVersion: z.string().min(1).nullish(),
});

type SystemInfo = {
  openchamberVersion: string | null;
  ompVersion: string | null;
};

const EMPTY_SYSTEM_INFO: SystemInfo = { openchamberVersion: null, ompVersion: null };

function useSystemInfo(): SystemInfo {
  const [info, setInfo] = React.useState<SystemInfo>(EMPTY_SYSTEM_INFO);

  React.useEffect(() => {
    let cancelled = false;
    void runtimeFetch('/api/system/info', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const parsed = SystemInfoSchema.safeParse(data);
        if (!parsed.success) return;
        setInfo({
          openchamberVersion: parsed.data.openchamberVersion ?? null,
          ompVersion: parsed.data.ompVersion ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setInfo(EMPTY_SYSTEM_INFO);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

function useDesktopAppVersion(enabled: boolean): string | null {
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getDesktopAppVersion().then((value) => {
      if (!cancelled) setVersion(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return version;
}

export const AboutSettings: React.FC = () => {
  const { t } = useI18n();
  const isDesktopRemote = useDesktopRemoteHostActive();
  const { openchamberVersion: serverVersion, ompVersion } = useSystemInfo();
  const desktopAppVersion = useDesktopAppVersion(isDesktopRemote);
  const appVersion = desktopAppVersion || serverVersion;

  const valueRow = { alignEnd: false, controlClassName: 'min-h-8 flex-wrap @xl:flex-initial' } as const;
  const versionValue = (version: string) => (
    <span className="typography-meta font-mono text-muted-foreground">{version}</span>
  );
  const unknown = t('settings.openchamber.about.state.unknown');

  return (
    <>
      <SettingsSection>
        <div className="flex items-center gap-4">
          <AboutLogo size={48} />
          <div className="min-w-0 space-y-1">
            <h2 className={SETTINGS_BRAND_TITLE_CLASS}>OhPiChamber</h2>
            <p className="typography-meta text-muted-foreground">{t('settings.openchamber.about.credit')}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {[
                { href: GITHUB_URL, icon: 'github-fill' as const, label: 'GitHub' },
                { href: UPSTREAM_GITHUB_URL, icon: 'external-link' as const, label: 'OpenChamber' },
                { href: MAINTAINER_URL, icon: 'user' as const, label: 'ShizukuYume' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 typography-meta text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon name={link.icon} className="size-4" />
                  <span>{link.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <div>
          {isDesktopRemote ? (
            <>
              <SettingsFieldRow label={t('settings.openchamber.about.field.appVersion')} {...valueRow}>
                {versionValue(appVersion || unknown)}
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.openchamber.about.field.serverVersion')} {...valueRow}>
                {versionValue(serverVersion || unknown)}
              </SettingsFieldRow>
            </>
          ) : (
            <SettingsFieldRow label={t('settings.openchamber.about.field.version')} {...valueRow}>
              {versionValue(serverVersion || unknown)}
            </SettingsFieldRow>
          )}
          {ompVersion !== null && (
            <SettingsFieldRow label={t('settings.openchamber.about.field.ompVersion')} {...valueRow}>
              {versionValue(ompVersion)}
            </SettingsFieldRow>
          )}
          <InstanceServiceUrls label={t('settings.openchamber.about.field.instanceUrls')} />
        </div>
      </SettingsSection>

      <AboutUpdatesSection />

      <AboutReleaseNotes version={serverVersion || appVersion} />

      <p className="typography-meta text-muted-foreground">{t('settings.openchamber.about.creditLicense')}</p>
    </>
  );
};
