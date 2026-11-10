import React from 'react';
import { OpenChamberVisualSettings } from './OpenChamberVisualSettings';
import { ChatSettings } from './ChatSettings';
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
import { DesktopAppSettings, DesktopQuickAccessSettings } from './DesktopAppSettings';
import { GeneralConnectionAndPrivacySettings, GeneralFilesAndTerminalSettings, GeneralInterfaceSettings } from './GeneralWorkspaceSettings';
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
    /** Which section to display. */
    section: OpenChamberSection;
}

export const OpenChamberPage: React.FC<OpenChamberPageProps> = ({ section }) => {
    const { t } = useI18n();
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();

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

// General, by what people come here for: the desktop app itself, the agent's
// tools, how other devices reach this app, the window, global shortcuts,
// files and the terminal, then trusted links, message transport and privacy.
// The layout drops the divider above whichever section renders first.
const GeneralSectionContent: React.FC = () => {
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();
    const isLocalDesktop = isDesktopShell() && isDesktopLocalOriginActive();
    // Passkeys only work against the browser's WebAuthn UI on the web surface —
    // desktop shell and the Capacitor app never show the login screen.
    const showPasskeySettings = isWebRuntime() && !isDesktopShell() && !isCapacitorApp();
    return (
        <>
            {/* Remote hosts too: the Dock badge works there. */}
            {isDesktopShell() && <DesktopAppSettings />}
            <OpenChamberToolsSettings />
            {isLocalDesktop && <DesktopNetworkSettings />}
            {showPasskeySettings && <PasskeySettings />}
            <GeneralInterfaceSettings />
            {isLocalDesktop && <DesktopQuickAccessSettings />}
            {/* Remounts on a runtime switch: the names come from that server. */}
            <EnvironmentVariablesSettings key={runtimeEndpointEpoch} />
            <GeneralFilesAndTerminalSettings />
            <AppLinkSecuritySettings />
            <GeneralConnectionAndPrivacySettings />
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
