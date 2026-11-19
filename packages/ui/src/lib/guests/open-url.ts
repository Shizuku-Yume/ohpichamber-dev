import { isLoopbackHttpUrl } from '@/lib/url';

type GuestUrlTarget = 'browser-panel' | 'system';

type GuestUrlContext = {
  panelAvailable: boolean;
  directory: string | null;
  linksInPanel: boolean;
};

export const guestUrlTarget = (url: string, { panelAvailable, directory, linksInPanel }: GuestUrlContext): GuestUrlTarget => (
  panelAvailable && directory && (linksInPanel || isLoopbackHttpUrl(url)) ? 'browser-panel' : 'system'
);
