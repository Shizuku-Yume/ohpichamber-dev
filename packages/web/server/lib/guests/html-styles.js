import { GUEST_BOOTSTRAP_SCRIPT, GUEST_SCROLLBAR_CSS, GUEST_SCROLLBAR_SCRIPT } from '@openchamber/sdk';

// The panel iframe inherits the host's dark color scheme, and a document that
// does not declare one gets an opaque white canvas until its own theme loads:
// a white flash on every mount (issue #4017). The declaration has to precede
// the first paint, so it goes first: right after a leading doctype (matched
// only at the very start, never inside authored markup), else before all.
const GUEST_COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark">';
const GUEST_BOOTSTRAP_ATTRIBUTE = 'data-openchamber-guest-bootstrap';
const guestBootstrapTag = () => `<script ${GUEST_BOOTSTRAP_ATTRIBUTE}>${GUEST_BOOTSTRAP_SCRIPT}</script>`;
const LEADING_DOCTYPE = /^\s*<!doctype[^>]*>/i;

const declareColorScheme = (html) => {
  const doctype = LEADING_DOCTYPE.exec(html)?.[0] ?? '';
  return `${doctype}${GUEST_COLOR_SCHEME_META}${html.slice(doctype.length)}`;
};

/** Run the host bootstrap before any authored metadata or script. The scrollbar style and activity script stay appended. */
export const injectGuestDocumentStyles = (html) => {
  const decorated = declareColorScheme(html);
  const doctype = LEADING_DOCTYPE.exec(decorated)?.[0] ?? '';
  const head = `${doctype}${GUEST_COLOR_SCHEME_META}`;
  return `${decorated.slice(0, head.length)}${guestBootstrapTag()}${decorated.slice(head.length)}\n<style data-openchamber-guest-styles>${GUEST_SCROLLBAR_CSS}</style>\n<script data-openchamber-guest-scrollbar>${GUEST_SCROLLBAR_SCRIPT}</script>`;
};
