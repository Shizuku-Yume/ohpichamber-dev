import { openExternalUrl } from '@/lib/url';


// What a walkthrough is — and what it deliberately is not — cannot be read off
// the panel: the first question users asked about it was whether its marks were
// review findings. The guide answers that, so it is reachable from the surface
// itself rather than only from the release announcement.
const WALKTHROUGH_GUIDE_URL = 'https://github.com/Shizuku-Yume/ohpichamber/tree/main/packages/docs/content/docs/walkthrough.mdx';

export const openWalkthroughGuide = () => {
  void openExternalUrl(WALKTHROUGH_GUIDE_URL);
};

export const MENU_GROUP_LABEL_CLASS = 'typography-meta font-normal text-muted-foreground';
