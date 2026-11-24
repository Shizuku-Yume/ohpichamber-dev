import type { I18nKey } from '@/lib/i18n/store';

/**
 * A role edited on another page, where it sits beside the controls that
 * depend on it. The hub shows its value and sends the reader there.
 */
interface LinkedRole {
  readonly page: string;
  readonly item?: string;
  readonly linkKey: I18nKey;
}

export const LINKED_ROLES: Readonly<Record<string, LinkedRole>> = {
  web: { page: 'web-search', linkKey: 'settings.omp.modelRoles.link.webSearch' },
  speech: { page: 'voice', linkKey: 'settings.omp.modelRoles.link.voice' },
};

/**
 * OMP 19.1's built-in roles in its own order (`config/model-roles.ts`). Chat
 * roles accept a chat model, so the chat catalog is their exact candidate
 * list. `judge` also accepts chat models; `image` reads the image catalog.
 * `dictation` is left out: only the terminal's speech input reads it, and
 * the app dictates through Voice.
 */
export const CHAT_ROLES = ['default', 'smol', 'slow', 'vision', 'plan', 'commit', 'tiny', 'memory', 'task', 'advisor', 'widget'] as const;
export const KIND_ROLES = ['image', 'web', 'speech', 'judge'] as const;

/** Built-in roles the hub leaves out, each with the reason. */
export const OMITTED_ROLES: Readonly<Record<string, string>> = {
  dictation: 'Only the terminal speech input reads it; the app dictates through Voice.',
};
