import React from 'react';

import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui';
import type { PairingConnectionPayload } from '@/lib/connectionPayload';
import { useI18n } from '@/lib/i18n';

import { useMobileConnection } from './mobileConnections';
import { MobileQrConnectionLoading } from './MobileQrScannerOverlay';

export const useMobilePairingConfirmation = (onConnected: () => void) => {
  const { t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const { redeemPairingConnection, isBusy, error } = useMobileConnection(onConnected);

  React.useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const onPairing = React.useCallback(async (payload: PairingConnectionPayload) => {
    if (isBusy) return;
    const origins = new Set(payload.candidates.map((candidate) =>
      new URL(candidate.type === 'relay' ? candidate.relayUrl : candidate.url).origin,
    ));
    const message = [payload.label, ...origins].filter(Boolean).join('\n');
    if (await confirm({
      title: t('mobile.connect.welcome.title'),
      message,
      action: t('mobile.connect.connectButton'),
    })) {
      await redeemPairingConnection(payload);
    }
  }, [confirm, isBusy, redeemPairingConnection, t]);

  return {
    onPairing,
    pairingConfirmation: <>{dialog}{isBusy ? <MobileQrConnectionLoading /> : null}</>,
  };
};
