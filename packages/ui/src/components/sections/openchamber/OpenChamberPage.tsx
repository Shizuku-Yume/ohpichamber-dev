import React from 'react';
import { OpenChamberVisualSettings } from './OpenChamberVisualSettings';
import { ChatSettings } from './ChatSettings';
import { SessionRetentionSettings } from './SessionRetentionSettings';
import { MergedWorktreeCleanupSettings } from './MergedWorktreeCleanupSettings';
import { SessionWorkSettings } from './SessionWorkSettings';
import { PasskeySettings } from './PasskeySettings';
import { AppLinkSecuritySettings } from './AppLinkSecuritySettings';
import { DefaultsSettings, SessionContextSettings } from './DefaultsSettings';
import { GitSettings } from './GitSettings';
import { NotificationSettings } from './NotificationSettings';
import { VoiceSettings } from './VoiceSettings';
import { TunnelSettings } from './TunnelSettings';
import { EnvironmentVariablesSettings } from './EnvironmentVariablesSettings';
import { DesktopNetworkSettings } from './DesktopNetworkSettings';
import { DesktopAppSettings, DesktopQuickAccessSettings } from './DesktopAppSettings';
<<<<<<< HEAD
import { GeneralFilesAndTerminalSettings, GeneralInterfaceSettings } from './GeneralWorkspaceSettings';
||||||| bc50ba56aa
import { ChatSettings } from './ChatSettings';
import { GeneralConnectionAndPrivacySettings, GeneralFilesAndTerminalSettings, GeneralInterfaceSettings } from './GeneralWorkspaceSettings';
=======
import { ChatSettings } from './ChatSettings';
import { GeneralConnectionAndPrivacySettings, GeneralFilesAndTerminalSettings, GeneralInterfaceSettings } from './GeneralWorkspaceSettings';
import { MobileAppSettings } from './MobileAppSettings';
>>>>>>> upstream/main
import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { isDesktopLocalOriginActive, isDesktopShell, isWebRuntime } from '@/lib/desktop';
import { isCapacitorApp } from '@/lib/platform';
import { useI18n } from '@/lib/i18n';
import { subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import type { OpenChamberSection } from './types';

const useRuntimeEndpointEpoch = (): number => {
    const [epoch, setEpoch] = React.useState(0);

    React.useEffect(() => {
        return subscribeRuntimeEndpointChanged(() => setEpoch((current) => current + 1));
    }, []);

    return epoch;
};

interface OpenChamberPageProps {
    section: OpenChamberSection;
}

export const OpenChamberPage: React.FC<OpenChamberPageProps> = ({ section }) => {
    const { t } = useI18n();
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();

    const renderSectionContent = () => {
        switch (section) {
            case 'general':
                return <GeneralSectionContent />;
            case 'visual':
                return <VisualSectionContent />;
            case 'chat':
                return <ChatSectionContent />;
            case 'sessions':
                return <SessionsSectionContent runtimeEndpointEpoch={runtimeEndpointEpoch} />;
            case 'shortcuts':
                return <ShortcutsSectionContent />;
            case 'git':
                return <GitSectionContent />;
            case 'notifications':
                return <NotificationSectionContent />;
            case 'voice':
                return <VoiceSectionContent />;
            case 'tunnel':
                return <TunnelSectionContent />;
            default:
                return null;
        }
    };

    const pageTitle = {
        general: t('settings.page.general.title'),
        visual: t('settings.page.appearance.title'),
        chat: t('settings.page.chat.title'),
        sessions: t('settings.page.sessions.title'),
        shortcuts: t('settings.page.shortcuts.title'),
        git: t('settings.page.git.title'),
        github: t('settings.page.git.title'),
        notifications: t('settings.page.notifications.title'),
        voice: t('settings.page.voice.title'),
        tunnel: t('settings.page.tunnel.title'),
    }[section];

    const pageDescription = {
        general: t('settings.page.general.description'),
        visual: t('settings.page.appearance.description'),
        chat: t('settings.page.chat.description'),
        sessions: t('settings.page.sessions.description'),
        shortcuts: t('settings.page.shortcuts.description'),
        git: undefined,
        github: undefined,
        notifications: t('settings.page.notifications.description'),
        voice: t('settings.page.voice.description'),
        tunnel: t('settings.page.tunnel.description'),
    }[section];

    return (
        <SettingsPageLayout
            title={pageTitle}
            description={pageDescription}
            showSaveStatus
        >
            {renderSectionContent()}
        </SettingsPageLayout>
    );
};

const ShortcutsSectionContent: React.FC = () => {
    return <KeyboardShortcutsSettings />;
};

<<<<<<< HEAD
// General, by what people come here for: the desktop app itself, the agent's
// tools, how other devices reach this app, the window, global shortcuts,
// files and the terminal, then trusted links.
// The layout drops the divider above whichever section renders first.
||||||| bc50ba56aa
// General, by what people come here for: the desktop app itself, the agent's
// tools, how other devices reach this app, the window, global shortcuts, the
// OpenCode CLI and its environment, files and the terminal, then trusted
// links, message transport and privacy. The layout drops the divider above
// whichever section renders first.
=======
>>>>>>> upstream/main
const GeneralSectionContent: React.FC = () => {
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();
    const isLocalDesktop = isDesktopShell() && isDesktopLocalOriginActive();
<<<<<<< HEAD
    // Passkeys only work against the browser's WebAuthn UI on the web surface —
    // desktop shell and the Capacitor app never show the login screen.
    const showPasskeySettings = isWebRuntime() && !isDesktopShell() && !isCapacitorApp();
||||||| bc50ba56aa
    // Passkeys only work against the browser's WebAuthn UI on the web surface —
    // desktop shell, VS Code, and the Capacitor app never show the login screen.
    const showPasskeySettings = isWebRuntime() && !isDesktopShell() && !isVSCode && !isCapacitorApp();
=======
    const showPasskeySettings = isWebRuntime() && !isDesktopShell() && !isVSCode && !isCapacitorApp();
>>>>>>> upstream/main
    return (
        <>
            {isDesktopShell() && <DesktopAppSettings />}
<<<<<<< HEAD
||||||| bc50ba56aa
            {!isVSCode && <OpenChamberToolsSettings />}
=======
            <MobileAppSettings />
            {!isVSCode && <OpenChamberToolsSettings />}
>>>>>>> upstream/main
            {isLocalDesktop && <DesktopNetworkSettings />}
            {showPasskeySettings && <PasskeySettings />}
            <GeneralInterfaceSettings />
            {isLocalDesktop && <DesktopQuickAccessSettings />}
<<<<<<< HEAD
            {/* Remounts on a runtime switch: the names come from that server. */}
            <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />
||||||| bc50ba56aa
            {!isVSCode && <OpenCodeCliSettings />}
            {/* Remounts on a runtime switch: the names come from that server. */}
            {!isVSCode && <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />}
=======
            {!isVSCode && <OpenCodeCliSettings />}
            {!isVSCode && <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />}
>>>>>>> upstream/main
            <GeneralFilesAndTerminalSettings />
            <AppLinkSecuritySettings />
        </>
    );
};

const VisualSectionContent: React.FC = () => {
    return <OpenChamberVisualSettings visibleSettings={[
        'theme',
        'windowControlsPosition',
        'pwaInstallName',
        'pwaOrientation',
        'mobileKeyboardMode',
        'timeFormat',
        'weekStart',
        'fontSize',
        'terminalFontSize',
        'editorFontSize',
        'spacing',
        'scrollbars',
        'inputBarOffset',
        'animatedActivityIndicators',
    ]} />;
};

// Chat section: the transcript, the composer and the assistance around a session,
// split into tabs by ChatSettings.
const ChatSectionContent: React.FC = () => {
    return <ChatSettings />;
};

const SessionsSectionContent: React.FC<{ runtimeEndpointEpoch: number }> = ({ runtimeEndpointEpoch }) => {
    return (
        <>
            <DefaultsSettings key={`defaults-${runtimeEndpointEpoch}`} />
            <SessionWorkSettings />
            <SessionRetentionSettings />
<<<<<<< HEAD
            <MergedWorktreeCleanupSettings />
||||||| bc50ba56aa
            {!isVSCodeRuntime() && <FinishedWorktreesSettings />}
=======
            {!isVSCodeRuntime() && <FinishedWorktreesSettings />}
            <SessionContextSettings key={`context-${runtimeEndpointEpoch}`} />
>>>>>>> upstream/main
        </>
    );
};

const GitSectionContent: React.FC = () => {
    return <GitSettings />;
};

const NotificationSectionContent: React.FC = () => {
    return <NotificationSettings />;
};

const VoiceSectionContent: React.FC = () => {
    return <VoiceSettings />;
};

<<<<<<< HEAD
||||||| bc50ba56aa
// Isolated spaces: the switch, the idle stop, the places with their disk, and the spaces without a
// project. Never in VS Code (decision 16); whether Settings offers the page at all is the page's
// `isAvailable` in lib/settings/metadata.ts.
const SpacesSectionContent: React.FC = () => {
    if (isVSCodeRuntime()) {
        return null;
    }
    return <IsolatedSpacesSettings />;
};

=======
const SpacesSectionContent: React.FC = () => {
    if (isVSCodeRuntime()) {
        return null;
    }
    return <IsolatedSpacesSettings />;
};

>>>>>>> upstream/main
const TunnelSectionContent: React.FC = () => {
    return <TunnelSettings />;
};
