import React from 'react';
import { isDesktopShell, restartDesktopApp } from '@/lib/desktop';
import { DesktopConnectionRecovery, type RecoveryVariant } from './DesktopConnectionRecovery';
import { RemoteConnectionForm } from './RemoteConnectionForm';
import { desktopHostsGet, desktopHostsSet } from '@/lib/desktopHosts';

type RecoveryScreenProps = {
  variant: RecoveryVariant;
  hostUrl?: string;
  hostLabel?: string;
  /** Callback when user chooses remote */
  onChooseRemote?: () => void;
  showRemoteForm?: boolean;
  onCloseRemoteForm?: () => void;
  /** Whether retry action is in progress */
  isRetrying?: boolean;
  localAvailable?: boolean;
};

export function RecoveryScreen({
  variant,
  hostUrl,
  hostLabel,
  onChooseRemote,
  showRemoteForm = false,
  onCloseRemoteForm,
  isRetrying = false,
  localAvailable = true,
}: RecoveryScreenProps) {
  const persistFirstChoice = React.useCallback(async (choice: 'local' | 'remote') => {
    if (!isDesktopShell()) return;

    const config = await desktopHostsGet();
    await desktopHostsSet({
      ...config,
      ...(choice === 'local' ? { defaultHostId: 'local' } : {}),
      initialHostChoiceCompleted: true,
    });
  }, []);

  const handleRecoveryRetry = React.useCallback(async () => {
    if (isDesktopShell()) {
      await restartDesktopApp();
      return;
    }

    window.location.reload();
  }, []);

  const handleRecoveryUseLocal = React.useCallback(async () => {
    // switch-default-to-local → persist local choice and restart
    await persistFirstChoice('local');

    if (isDesktopShell()) {
      await restartDesktopApp();
      return;
    }

    window.location.reload();
  }, [persistFirstChoice]);

  const handleRecoveryUseRemote = React.useCallback(() => {
    onChooseRemote?.();
  }, [onChooseRemote]);

  if (showRemoteForm) {
    const prefillUrl = variant === 'remote-wrong-service' ? '' : (hostUrl || '');
    const prefillLabel = variant === 'remote-wrong-service' ? '' : (hostLabel || '');
    return (
      <RemoteConnectionForm
        onBack={onCloseRemoteForm || (() => onChooseRemote?.())}
        initialUrl={prefillUrl}
        initialLabel={prefillLabel}
        isRecoveryMode={true}
        showInstancePicker={!localAvailable}
        onSwitchToLocal={localAvailable ? () => void handleRecoveryUseLocal() : undefined}
      />
    );
  }

  return (
    <DesktopConnectionRecovery
      variant={variant}
      hostLabel={hostLabel}
      hostUrl={hostUrl}
      onRetry={handleRecoveryRetry}
      onUseLocal={localAvailable ? handleRecoveryUseLocal : undefined}
      onUseRemote={handleRecoveryUseRemote}
      isRetrying={isRetrying}
    />
  );
}
