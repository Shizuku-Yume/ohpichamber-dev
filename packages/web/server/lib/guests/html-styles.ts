import { GUEST_BOOTSTRAP_SCRIPT, GUEST_SCROLLBAR_CSS, GUEST_SCROLLBAR_SCRIPT } from 'ohpichamber-sdk';
import { GUEST_UI_LOOK_CSS } from 'ohpichamber-sdk/ui';

// external: #4017 Declare the inherited color scheme before first paint to prevent a white iframe canvas.
const GUEST_COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark">';
const GUEST_BOOTSTRAP_ATTRIBUTE = 'data-openchamber-guest-bootstrap';
const guestBootstrapTag = () => `<script ${GUEST_BOOTSTRAP_ATTRIBUTE}>${GUEST_BOOTSTRAP_SCRIPT}</script>`;
const LEADING_DOCTYPE = /^\s*<!doctype[^>]*>/i;

const declareColorScheme = (html: string) => {
  const doctype = LEADING_DOCTYPE.exec(html)?.[0] ?? '';
  return `${doctype}${GUEST_COLOR_SCHEME_META}${html.slice(doctype.length)}`;
};

export const injectGuestDocumentStyles = (html: string) => {
  const decorated = declareColorScheme(html);
  const doctype = LEADING_DOCTYPE.exec(decorated)?.[0] ?? '';
  const head = `${doctype}${GUEST_COLOR_SCHEME_META}`;
  return `${decorated.slice(0, head.length)}${guestBootstrapTag()}${decorated.slice(head.length)}\n<style data-openchamber-guest-styles>${GUEST_SCROLLBAR_CSS}${GUEST_UI_LOOK_CSS}</style>\n<script data-openchamber-guest-scrollbar>${GUEST_SCROLLBAR_SCRIPT}</script>`;
};
