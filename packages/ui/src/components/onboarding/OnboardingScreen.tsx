import React from 'react';
import { ChooserScreen } from './ChooserScreen';
import { RecoveryScreen } from './RecoveryScreen';
import type { RecoveryVariant } from './DesktopConnectionRecovery';

type OnboardingScreenMode = 'first-launch' | 'recovery';

type OnboardingScreenProps = {
<<<<<<< HEAD
  onChooseLocal?: () => void;
  /** Screen mode to render */
||||||| bc50ba56aa
  /** Callback when user goes back from local-setup */
  onBack?: () => void;
  /** Callback when CLI becomes available */
  onCliAvailable?: () => void;
  /** Screen mode to render */
=======
  onBack?: () => void;
  onCliAvailable?: () => void;
>>>>>>> upstream/main
  mode?: OnboardingScreenMode;
  recoveryVariant?: RecoveryVariant;
  recoveryHostUrl?: string;
  recoveryHostLabel?: string;
<<<<<<< HEAD
  /** Saved host the recovery is about */
||||||| bc50ba56aa
  /** Saved host the recovery is about */
  recoveryHostId?: string;
  /** Callback when user enters local setup from recovery */
  onEnterLocalSetup?: () => void;
  /** Callback when user wants to switch to remote (first-launch only) */
  onChooseRemote?: () => void;
=======
  recoveryHostId?: string;
  onEnterLocalSetup?: () => void;
  onChooseRemote?: () => void;
>>>>>>> upstream/main
  localAvailable?: boolean;
};

export function OnboardingScreen({
  onChooseLocal,
  mode = 'first-launch',
  recoveryVariant = 'missing-default-host',
  recoveryHostUrl,
  recoveryHostLabel,
  localAvailable = true,
}: OnboardingScreenProps) {
  const [showRecoveryRemoteForm, setShowRecoveryRemoteForm] = React.useState(false);

<<<<<<< HEAD
  // A different recovery target must not inherit the previous remote form.
||||||| bc50ba56aa
  // Reset transient recovery subflow state when the flow identity changes, so
  // stale local-setup or remote-form views don't bleed across prop updates.
=======
>>>>>>> upstream/main
  React.useEffect(() => {
    setShowRecoveryRemoteForm(false);
  }, [mode, recoveryVariant, recoveryHostUrl, recoveryHostLabel]);

<<<<<<< HEAD
  // Recovery mode
  if (mode === 'recovery') {
||||||| bc50ba56aa
  // Derive the effective mode: recovery → local-setup can fall through to the
  // existing local-setup branch instead of getting stuck behind the early return.
  const effectiveMode = recoveryEnteredLocalSetup ? 'local-setup' : mode;

  // Recovery mode
  if (effectiveMode === 'recovery') {
=======
  const effectiveMode = recoveryEnteredLocalSetup ? 'local-setup' : mode;

  if (effectiveMode === 'recovery') {
>>>>>>> upstream/main
    return (
      <RecoveryScreen
        variant={recoveryVariant}
        hostUrl={recoveryHostUrl}
        hostLabel={recoveryHostLabel}
        onChooseRemote={() => setShowRecoveryRemoteForm(true)}
        showRemoteForm={showRecoveryRemoteForm}
        onCloseRemoteForm={() => setShowRecoveryRemoteForm(false)}
        localAvailable={localAvailable}
      />
    );
  }

<<<<<<< HEAD
||||||| bc50ba56aa
  // Local-setup mode
  if (effectiveMode === 'local-setup') {
    return (
      <LocalSetupScreen
        onBack={() => {
          if (recoveryEnteredLocalSetup) {
            setRecoveryEnteredLocalSetup(false);
          } else {
            onBack?.();
          }
        }}
        onCliAvailable={onCliAvailable}
        isFromRecovery={recoveryEnteredLocalSetup}
        onSwitchToRemote={() => setShowRecoveryRemoteForm(true)}
      />
    );
  }
=======
  if (effectiveMode === 'local-setup') {
    return (
      <LocalSetupScreen
        onBack={() => {
          if (recoveryEnteredLocalSetup) {
            setRecoveryEnteredLocalSetup(false);
          } else {
            onBack?.();
          }
        }}
        onCliAvailable={onCliAvailable}
        isFromRecovery={recoveryEnteredLocalSetup}
        onSwitchToRemote={() => setShowRecoveryRemoteForm(true)}
      />
    );
  }
>>>>>>> upstream/main

  return (
    <ChooserScreen
      onChooseLocal={onChooseLocal}
      localAvailable={localAvailable}
    />
  );
}
