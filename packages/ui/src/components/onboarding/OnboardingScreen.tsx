import React from 'react';
import { ChooserScreen } from './ChooserScreen';
import { RecoveryScreen } from './RecoveryScreen';
import type { RecoveryVariant } from './DesktopConnectionRecovery';

type OnboardingScreenMode = 'first-launch' | 'recovery';

type OnboardingScreenProps = {
  onChooseLocal?: () => void;
  /** Screen mode to render */
  mode?: OnboardingScreenMode;
  /** Recovery variant (only used when mode is 'recovery') */
  recoveryVariant?: RecoveryVariant;
  /** Host URL for recovery context */
  recoveryHostUrl?: string;
  /** Host label for recovery context */
  recoveryHostLabel?: string;
  /** Saved host the recovery is about */
  recoveryHostId?: string;
  localAvailable?: boolean;
};

export function OnboardingScreen({
  onChooseLocal,
  mode = 'first-launch',
  recoveryVariant = 'missing-default-host',
  recoveryHostUrl,
  recoveryHostLabel,
  recoveryHostId,
  localAvailable = true,
}: OnboardingScreenProps) {
  const [showRecoveryRemoteForm, setShowRecoveryRemoteForm] = React.useState(false);

  // A different recovery target must not inherit the previous remote form.
  React.useEffect(() => {
    setShowRecoveryRemoteForm(false);
  }, [mode, recoveryVariant, recoveryHostUrl, recoveryHostLabel]);

  // Recovery mode
  if (mode === 'recovery') {
    return (
      <RecoveryScreen
        variant={recoveryVariant}
        hostUrl={recoveryHostUrl}
        hostLabel={recoveryHostLabel}
        hostId={recoveryHostId}
        onChooseRemote={() => setShowRecoveryRemoteForm(true)}
        showRemoteForm={showRecoveryRemoteForm}
        onCloseRemoteForm={() => setShowRecoveryRemoteForm(false)}
        localAvailable={localAvailable}
      />
    );
  }


  // First-launch mode (default)
  return (
    <ChooserScreen
      onChooseLocal={onChooseLocal}
      localAvailable={localAvailable}
    />
  );
}
