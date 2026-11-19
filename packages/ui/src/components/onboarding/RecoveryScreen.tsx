import React from 'react';
import { isDesktopShell, restartDesktopApp } from '@/lib/desktop';
import { DesktopConnectionRecovery, type RecoveryVariant } from './DesktopConnectionRecovery';
import { RemoteConnectionForm } from './RemoteConnectionForm';
import { desktopHostsGet, desktopHostsSet } from '@/lib/desktopHosts';

type RecoveryScreenProps = {
  variant: RecoveryVariant;
  hostUrl?: string;
  hostLabel?: string;
<<<<<<< HEAD
  /** Callback when user chooses remote */
||||||| bc50ba56aa
  /** Saved host the recovery is about, when the boot named one */
  hostId?: string;
  /** Callback when user wants to retry */
  onRetry?: () => void;
  /** Callback when user chooses remote */
=======
  hostId?: string;
  onRetry?: () => void;
>>>>>>> upstream/main
  onChooseRemote?: () => void;
  showRemoteForm?: boolean;
  onCloseRemoteForm?: () => void;
<<<<<<< HEAD
  /** Whether retry action is in progress */
||||||| bc50ba56aa
  /** Callback when switching to local from remote form */
  onSwitchToLocalFromRemote?: () => void;
  /** Callback when entering local setup */
  onEnterLocalSetup?: () => void;
  /** Whether retry action is in progress */
=======
  onSwitchToLocalFromRemote?: () => void;
  onEnterLocalSetup?: () => void;
>>>>>>> upstream/main
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
<<<<<<< HEAD
    // switch-default-to-local → persist local choice and restart
||||||| bc50ba56aa
    const step = resolveRecoveryNextStep(variant, 'use-local');
    if (step.kind === 'local-setup') {
      // local-unavailable + local → enter local-setup subflow without reload
      onEnterLocalSetup?.();
      return;
    }
    // switch-default-to-local → persist local choice and restart
=======
    const step = resolveRecoveryNextStep(variant, 'use-local');
    if (step.kind === 'local-setup') {
      onEnterLocalSetup?.();
      return;
    }
>>>>>>> upstream/main
    await persistFirstChoice('local');

    if (isDesktopShell()) {
      await restartDesktopApp();
      return;
    }

    window.location.reload();
<<<<<<< HEAD
  }, [persistFirstChoice]);
||||||| bc50ba56aa
  }, [variant, persistFirstChoice, onEnterLocalSetup]);

  const [serverUpdate, setServerUpdate] = React.useState<ServerUpdateState>({ kind: 'idle' });

  // Only a saved host with a direct address can be asked to update: a server
  // named by environment override is not in the hosts file.
  const [updatableHostId, setUpdatableHostId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setUpdatableHostId(null);
    if (variant !== 'remote-incompatible' || !hostId || !isDesktopShell()) return;
    let cancelled = false;
    void desktopHostsGet().then((config) => {
      const host = config.hosts.find((entry) => entry.id === hostId);
      const directUrl = normalizeHostUrl(host?.apiUrl || host?.url || '');
      if (!cancelled && directUrl) setUpdatableHostId(hostId);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [variant, hostId]);

  // The host runs an OpenChamber this app cannot use: ask it to update itself,
  // wait for it to come back compatible, then boot again so the app connects.
  // Every way out ends in a state the screen can leave.
  const handleUpdateServer = React.useCallback(async (targetHostId: string) => {
    setServerUpdate({ kind: 'updating' });
    try {
      const result = await desktopHostUpdateServer(targetHostId);
      if (result.status === 'auth') {
        setServerUpdate({ kind: 'auth' });
        return;
      }
      if (result.status === 'failed') {
        setServerUpdate({ kind: 'refused', error: result.error });
        return;
      }
      if (await waitForDesktopHostUpdated(targetHostId) === 'timeout') {
        setServerUpdate({ kind: 'timeout' });
        return;
      }
      // Updated: a failed restart leaves Retry, which restarts as well.
      if (!await restartDesktopApp()) setServerUpdate({ kind: 'idle' });
    } catch {
      setServerUpdate({ kind: 'timeout' });
    }
  }, []);
=======
  }, [variant, persistFirstChoice, onEnterLocalSetup]);

  const [serverUpdate, setServerUpdate] = React.useState<ServerUpdateState>({ kind: 'idle' });

  const [updatableHostId, setUpdatableHostId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setUpdatableHostId(null);
    if (variant !== 'remote-incompatible' || !hostId || !isDesktopShell()) return;
    let cancelled = false;
    void desktopHostsGet().then((config) => {
      const host = config.hosts.find((entry) => entry.id === hostId);
      const directUrl = normalizeHostUrl(host?.apiUrl || host?.url || '');
      if (!cancelled && directUrl) setUpdatableHostId(hostId);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [variant, hostId]);

  const handleUpdateServer = React.useCallback(async (targetHostId: string) => {
    setServerUpdate({ kind: 'updating' });
    try {
      const result = await desktopHostUpdateServer(targetHostId);
      if (result.status === 'auth') {
        setServerUpdate({ kind: 'auth' });
        return;
      }
      if (result.status === 'failed') {
        setServerUpdate({ kind: 'refused', error: result.error });
        return;
      }
      if (await waitForDesktopHostUpdated(targetHostId) === 'timeout') {
        setServerUpdate({ kind: 'timeout' });
        return;
      }
      if (!await restartDesktopApp()) setServerUpdate({ kind: 'idle' });
    } catch {
      setServerUpdate({ kind: 'timeout' });
    }
  }, []);
>>>>>>> upstream/main

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
