import { getChatsRoot } from '@/lib/chatDirectories';
import type { SettingsSearchItem } from './search';

export const SESSION_DEFAULTS_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  {
    id: 'sessions.default-model',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.defaultModel',
    keywords: ['model', 'provider', 'new sessions', 'thinking', 'reasoning', 'variant'],
  },
  {
    id: 'sessions.fallback-model',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.fallbackModel',
    descriptionKey: 'settings.openchamber.defaults.field.fallbackModelInfo',
    keywords: ['fallback', 'backup', 'usage limit', 'quota', 'rate limit', 'model', 'thinking'],
  },
  {
    id: 'sessions.chats-default-model',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.chatsDefaultModel',
    keywords: ['chats', 'chat', 'model', 'provider', 'thinking', 'reasoning', 'variant', 'no project'],
    isAvailable: () => getChatsRoot() !== null,
  },
];
