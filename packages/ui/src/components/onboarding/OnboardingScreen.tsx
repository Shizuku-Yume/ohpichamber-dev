import React from 'react';
import { ChooserScreen } from './ChooserScreen';
import { RecoveryScreen } from './RecoveryScreen';
import type { RecoveryVariant } from './DesktopConnectionRecovery';

type OnboardingScreenMode = 'first-launch' | 'recovery';

type OnboardingScreenProps = {
  onChooseLocal?: () => void;
  /** Screen mode to render */
  mode?: OnboardingScreenMode;
  recoveryVariant?: RecoveryVariant;
  recoveryHostUrl?: string;
  recoveryHostLabel?: string;
  /** Saved host the recovery is about */
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
        onChooseRemote={() => setShowRecoveryRemoteForm(true)}
        showRemoteForm={showRecoveryRemoteForm}
        onCloseRemoteForm={() => setShowRecoveryRemoteForm(false)}
        localAvailable={localAvailable}
      />
    );
  }


  return (
    <ChooserScreen
      onChooseLocal={onChooseLocal}
      localAvailable={localAvailable}
    />
  );
}
