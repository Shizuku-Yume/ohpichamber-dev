import React from 'react';
import { AboutLogo } from '@/components/ui/AboutLogo';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useDesktopRemoteHostActive } from '@/hooks/useDesktopRemoteHostActive';
import { getDesktopAppVersion } from '@/lib/desktopNative';
import { InstanceServiceUrls } from './InstanceServiceUrls';
import { AboutReleaseNotes } from './AboutReleaseNotes';
import {
  SettingsSection,
  SettingsFieldRow,
  SETTINGS_BRAND_TITLE_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';

const GITHUB_URL = 'https://github.com/Shizuku-Yume/ohpichamber';
const UPSTREAM_GITHUB_URL = 'https://github.com/openchamber/openchamber';

/** Version of the server this page is served by, from `/api/system/info`. */
function useServerVersion(): string | null {
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void runtimeFetch('/api/system/info', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { openchamberVersion?: unknown } | null) => {
        if (cancelled) return;
        const value = typeof data?.openchamberVersion === 'string' ? data.openchamberVersion.trim() : '';
        setVersion(value || null);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
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

/**
 * Settings > About: the brand and its links, the version that is running,
 * and what that version brought. Updates are not offered here: the desktop
 * app updates itself, and no other runtime updates from the app.
 */
export const AboutSettings: React.FC = () => {
  const { t } = useI18n();
  const isDesktopRemote = useDesktopRemoteHostActive();
  const serverVersion = useServerVersion();
  const desktopAppVersion = useDesktopAppVersion(isDesktopRemote);
  const appVersion = desktopAppVersion || serverVersion;

  return (
    <>
      <SettingsSection>
        <div className="flex items-center gap-4">
          <AboutLogo size={48} />
          <div className="min-w-0 space-y-1">
            <h2 className={SETTINGS_BRAND_TITLE_CLASS}>OhPiChamber</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {[
                { href: GITHUB_URL, icon: 'github-fill' as const, label: 'GitHub' },
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
              <SettingsFieldRow label={t('settings.openchamber.about.field.appVersion')}>
                <span className="typography-meta font-mono text-muted-foreground">{appVersion || t('settings.openchamber.about.state.unknown')}</span>
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.openchamber.about.field.serverVersion')}>
                <span className="typography-meta font-mono text-muted-foreground">{serverVersion || t('settings.openchamber.about.state.unknown')}</span>
              </SettingsFieldRow>
            </>
          ) : (
            <SettingsFieldRow label={t('settings.openchamber.about.field.version')}>
              <span className="typography-meta font-mono text-muted-foreground">{serverVersion || t('settings.openchamber.about.state.unknown')}</span>
            </SettingsFieldRow>
          )}
          <InstanceServiceUrls label={t('settings.openchamber.about.field.instanceUrls')} />
        </div>
      </SettingsSection>

      <AboutReleaseNotes version={serverVersion || appVersion} />

      <div className="space-y-2 text-center">
        <p className="text-muted-foreground">{t('aboutDialog.footerNote')}</p>
        <div className="space-y-0.5 typography-meta text-muted-foreground">
          <p>
            <a
              href={UPSTREAM_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <span>{t('settings.openchamber.about.credit')}</span>
              <Icon name="external-link" className="size-3.5" />
            </a>
          </p>
          <p>{t('settings.openchamber.about.creditLicense')}</p>
        </div>
      </div>
    </>
  );
};
