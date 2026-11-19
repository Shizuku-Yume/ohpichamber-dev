import type { reprobeActiveConnection } from './mobileConnections';
import type { MobileConnectionNotice } from './MobileConnectionsView';

export const retryNativeResumeConnection = async ({
  reprobe,
  isCurrent,
  refreshInPlace,
  disconnect,
}: {
  reprobe: typeof reprobeActiveConnection;
  isCurrent: () => boolean;
  refreshInPlace: () => void;
  disconnect: (reason: string, noticeKind?: MobileConnectionNotice['kind']) => void;
}): Promise<void> => {
  for (const { delay, fast } of [{ delay: 4000, fast: true }, { delay: 10000, fast: false }]) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    if (!isCurrent()) return;
    const outcome = await reprobe({ fast });
    if (!isCurrent()) return;
    switch (outcome) {
      case 'switched':
        return;
      case 'unchanged':
        refreshInPlace();
        return;
      case 'needs-login':
        disconnect('retry-needs-login', 'auth-expired');
        return;
      case 'relay-limit':
        disconnect('retry-relay-limit', 'relay-limit');
        return;
      case 'unreachable':
        if (!fast) disconnect('retry-unreachable', 'unreachable');
        break;
      case 'no-connection':
        if (!fast) disconnect('retry-no-connection');
        break;
    }
  }
};
