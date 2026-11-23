
import { create } from 'zustand';

export type ChatSettingsTab = 'messages' | 'composer' | 'assistance';

export const useChatSettingsTabStore = create<{
  tab: ChatSettingsTab;
  setTab: (tab: ChatSettingsTab) => void;
}>((set) => ({
  tab: 'messages',
  setTab: (tab) => set({ tab }),
}));

const SEARCH_TARGET_TABS = new Map<string, ChatSettingsTab>([
  ['chat.activity-default', 'messages'],
  ['chat.reasoning', 'messages'],
  ['chat.reasoning-traces', 'messages'],
  ['chat.tool-file-icons', 'messages'],
  ['chat.changed-files', 'messages'],
  ['chat.streaming-auto-follow', 'messages'],
  ['chat.message-appearance', 'messages'],
  ['chat.width', 'messages'],
  ['chat.prompt-navigator', 'messages'],
  ['chat.collapsible-user-messages', 'messages'],
  ['chat.sticky-user-header', 'messages'],
  ['chat.inline-assistant-actions', 'messages'],
  ['chat.selection-approval-text', 'messages'],
  ['chat.streaming', 'messages'],
  ['chat.tools-and-files', 'messages'],
  ['chat.dotfiles', 'messages'],
  ['chat.persist-drafts', 'composer'],
  ['chat.mobile-return-key-sends', 'composer'],
  ['chat.render-mode', 'messages'],
  ['chat.user-message-rendering', 'messages'],
  ['chat.mermaid-rendering', 'messages'],
  ['chat.diff-layout', 'messages'],
  ['chat.code-block-line-wrap', 'messages'],
  ['chat.table-cell-wrap', 'messages'],
  ['chat.copy-plain-text', 'messages'],
  ['chat.message-search', 'messages'],
  ['chat.message-search-enabled', 'messages'],
  ['chat.message-search-reasoning', 'messages'],
  ['chat.composer', 'composer'],
  ['chat.enter-to-send', 'composer'],
  ['chat.mobile-return-key-sends', 'composer'],
  ['chat.follow-up-behavior', 'composer'],
  ['chat.questions-placement', 'composer'],
  ['chat.large-text-paste', 'composer'],
  ['chat.document-attach', 'composer'],
  ['chat.save-pasted-images', 'composer'],
  ['chat.subagent-read-only-banner', 'composer'],
  ['chat.spellcheck', 'composer'],
  ['chat.input-history-scope', 'composer'],
  ['chat.input-history-limit', 'composer'],
  ['chat.session-assistance', 'assistance'],
  ['chat.draft-starters-visible', 'assistance'],
  ['chat.session-recap', 'assistance'],
  ['chat.suggestion-generator', 'assistance'],
  ['chat.session-review-offer', 'assistance'],
  ['chat.session-goal-checker', 'assistance'],
  ['chat.session-goal-max-turns', 'assistance'],
  ['chat.session-goal-budget', 'assistance'],
]);

/** The tab each OMP chat section's rows are drawn in. */
const OMP_SECTION_TABS: Readonly<Record<string, ChatSettingsTab>> = {
  composer: 'composer',
  magicKeywords: 'composer',
  btw: 'composer',
  display: 'messages',
  thinking: 'messages',
  images: 'messages',
};

export const chatSettingsTabForSearchTarget = (id: string): ChatSettingsTab | null => {
  const tab = SEARCH_TARGET_TABS.get(id);
  if (tab) return tab;
  if (id.startsWith('omp.')) {
    // An OMP row's section decides its tab: the composer keywords live in the
    // Composer tab, the transcript rows in Messages.
    const section = id.slice('omp.'.length).split('.')[0];
    return OMP_SECTION_TABS[section] ?? 'messages';
  }
  return null;
};

export const chatSettingsTabAnchors = (tab: ChatSettingsTab): string[] =>
  [...SEARCH_TARGET_TABS].filter(([, owner]) => owner === tab).map(([id]) => id);
