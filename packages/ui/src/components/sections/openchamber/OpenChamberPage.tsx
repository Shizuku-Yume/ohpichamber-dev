import React from 'react';
import { OpenChamberVisualSettings } from './OpenChamberVisualSettings';
import { ChatSettings } from './ChatSettings';
import { AboutSettings } from './AboutSettings';
import { SessionRetentionSettings } from './SessionRetentionSettings';
import { MergedWorktreeCleanupSettings } from './MergedWorktreeCleanupSettings';
import { SessionWorkSettings } from './SessionWorkSettings';
import { PasskeySettings } from './PasskeySettings';
import { AppLinkSecuritySettings } from './AppLinkSecuritySettings';
import { DefaultsSettings } from './DefaultsSettings';
import { GitSettings } from './GitSettings';
import { NotificationSettings } from './NotificationSettings';
import { VoiceSettings } from './VoiceSettings';
import { TunnelSettings } from './TunnelSettings';
import { EnvironmentVariablesSettings } from './EnvironmentVariablesSettings';
import { OpenChamberToolsSettings } from './OpenChamberToolsSettings';
import { DesktopNetworkSettings } from './DesktopNetworkSettings';
<<<<<<< HEAD
import { DesktopAppSettings } from './DesktopAppSettings';
import { MobileWorkspaceTabsSettings } from './MobileWorkspaceTabsSettings';
=======
import { DesktopAppSettings, DesktopQuickAccessSettings } from './DesktopAppSettings';
import { ChatSettings } from './ChatSettings';
import { GeneralConnectionAndPrivacySettings, GeneralFilesAndTerminalSettings, GeneralInterfaceSettings } from './GeneralWorkspaceSettings';
>>>>>>> bc50ba56a
import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useDeviceInfo } from '@/lib/device';
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
    /** Which section to display. If undefined, shows all sections (mobile/legacy behavior) */
    section?: OpenChamberSection;
}

export const OpenChamberPage: React.FC<OpenChamberPageProps> = ({ section }) => {
    const { t } = useI18n();
    const { isMobile } = useDeviceInfo();
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();
    const showAbout = isMobile && isWebRuntime();
    const isLocalDesktop = isDesktopShell() && isDesktopLocalOriginActive();
    const showDesktopNetworkSettings = isLocalDesktop;

    // If no section specified, show all (mobile/legacy behavior)
    if (!section) {
        return (
            <SettingsPageLayout showSaveStatus className="openchamber-page-body space-y-3 sm:space-y-6">
                <OpenChamberVisualSettings />
                <SessionWorkSettings />
                {showDesktopNetworkSettings && <DesktopNetworkSettings />}
                {isLocalDesktop && <DesktopAppSettings />}
                {isMobile && <MobileWorkspaceTabsSettings />}
                <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />
                <OpenChamberToolsSettings />
                <SessionRetentionSettings />
                <MergedWorktreeCleanupSettings />
                <AppLinkSecuritySettings />
                {isWebRuntime() && !isDesktopShell() && !isCapacitorApp() && <PasskeySettings />}
                {showAbout && <AboutSettings />}
            </SettingsPageLayout>
        );
    }

    // Show specific section content
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

<<<<<<< HEAD
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

=======
>>>>>>> bc50ba56a
    return (
        <SettingsPageLayout
            title={pageTitle}
            namedBySidebar
            showSaveStatus
            className="openchamber-page-body"
        >
            {renderSectionContent()}
        </SettingsPageLayout>
    );
};

const ShortcutsSectionContent: React.FC = () => {
    return <KeyboardShortcutsSettings />;
};

<<<<<<< HEAD
// General section: app-level settings — startup/tray/network, access password,
// passkeys, message stream transport, privacy.
=======
// General, by what people come here for: the desktop app itself, the agent's
// tools, how other devices reach this app, the window, global shortcuts, the
// OpenCode CLI and its environment, files and the terminal, then trusted
// links, message transport and privacy. The layout drops the divider above
// whichever section renders first.
>>>>>>> bc50ba56a
const GeneralSectionContent: React.FC = () => {
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();
    const { isMobile } = useDeviceInfo();
    const isLocalDesktop = isDesktopShell() && isDesktopLocalOriginActive();
    const showDesktopNetworkSettings = isLocalDesktop;
    // Passkeys only work against the browser's WebAuthn UI on the web surface —
    // desktop shell and the Capacitor app never show the login screen.
    const showPasskeySettings = isWebRuntime() && !isDesktopShell() && !isCapacitorApp();
    return (
        <>
<<<<<<< HEAD
            {isLocalDesktop && <DesktopAppSettings />}
            {isMobile && <MobileWorkspaceTabsSettings />}
            {showDesktopNetworkSettings && <DesktopNetworkSettings />}
            {showPasskeySettings && <PasskeySettings />}
            <AppLinkSecuritySettings />
            {/* Remounts on a runtime switch: the names come from that server. */}
            <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />
            <OpenChamberToolsSettings />
            <OpenChamberVisualSettings visibleSettings={[
                'fileEditorKeymap',
                'sessionTabs',
                'liveBrowserTabs',
                'autoSaveEnabled',
                'confirmFileTreeMove',
                'terminalQuickKeys',
                'terminalShell',
                'terminalLoginShell',
                'messageTransport',
                'reportUsage',
            ]} />
=======
            {/* Remote hosts too: the Dock badge works there. */}
            {isDesktopShell() && <DesktopAppSettings />}
            {!isVSCode && <OpenChamberToolsSettings />}
            {isLocalDesktop && <DesktopNetworkSettings />}
            {showPasskeySettings && <PasskeySettings />}
            <GeneralInterfaceSettings />
            {isLocalDesktop && <DesktopQuickAccessSettings />}
            {!isVSCode && <OpenCodeCliSettings />}
            {/* Remounts on a runtime switch: the names come from that server. */}
            {!isVSCode && <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />}
            <GeneralFilesAndTerminalSettings />
            <AppLinkSecuritySettings />
            <GeneralConnectionAndPrivacySettings />
>>>>>>> bc50ba56a
        </>
    );
};

// Visual section: Theme Mode, Font Size, Spacing, Input Bar Offset (mobile), Nav Rail
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

// Sessions section: Default model & agent, Session retention
const SessionsSectionContent: React.FC<{ runtimeEndpointEpoch: number }> = ({ runtimeEndpointEpoch }) => {
    return (
        <>
            <DefaultsSettings key={runtimeEndpointEpoch} />
            <SessionWorkSettings />
            <SessionRetentionSettings />
            <MergedWorktreeCleanupSettings />
        </>
    );
};

// Git section: Commit message model, Worktree settings
const GitSectionContent: React.FC = () => {
    return <GitSettings />;
};

// Notifications section: Native browser notifications
const NotificationSectionContent: React.FC = () => {
    return <NotificationSettings />;
};

// Voice section: Language selection and continuous mode
const VoiceSectionContent: React.FC = () => {
    return <VoiceSettings />;
};

const TunnelSectionContent: React.FC = () => {
    return <TunnelSettings />;
};
