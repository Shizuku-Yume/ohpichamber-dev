import { isLoopbackHttpUrl } from '@/lib/url';

type GuestUrlTarget = 'browser-panel' | 'system';

type GuestUrlContext = {
  /** The desktop app's browser panel can be shown on this surface. */
  panelAvailable: boolean;
  /** The project whose panel would show it; without one there is no panel. */
  directory: string | null;
  /** The user's setting to open web links in the browser panel. */
  linksInPanel: boolean;
};

/**
 * Where `host.openUrl` sends an address. A local address is a dev server or a
 * container port, so it opens beside the chat the way a project action's
 * preview does; any other link follows the same setting as links in chat.
 */
export const guestUrlTarget = (url: string, { panelAvailable, directory, linksInPanel }: GuestUrlContext): GuestUrlTarget => (
  panelAvailable && directory && (linksInPanel || isLoopbackHttpUrl(url)) ? 'browser-panel' : 'system'
);
