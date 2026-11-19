import type { SidebarSection } from '@/constants/sidebar';
import type { IconName } from '@/components/icon/icons';

export type SettingsPageSlug =
  | 'home'
  | 'general'
  | 'projects'
  | 'remote-instances'
  | 'providers'
  | 'web-search'
  | 'tools'
  | 'memory'
  | 'omp'
  | 'behavior'
  | 'usage'
  | 'agents'
  | 'commands'
  | 'mcp'
  | 'plugins'
  | 'skills.installed'
  | 'skills.catalog'
  | 'git'
  | 'appearance'
  | 'chat'
  | 'shortcuts'
  | 'sessions'
  | 'routing'
  | 'magic-prompts'
  | 'snippets'
  | 'notifications'
  | 'voice'
  | 'tunnel'
  | 'about'
  | 'integrations'
  | 'extensions';

type SettingsPageGroup =
  | 'general'
  | 'projects'
  | 'agent'
  | 'content';

export interface SettingsRuntimeContext {
  isWeb: boolean;
  isDesktop: boolean;
  isMobile: boolean;
  routingAvailable: boolean;
  enterpriseMode: boolean;
  jevBlockedByEnterprise: boolean;
}

export interface SettingsPageMeta {
  slug: SettingsPageSlug;
  title: string;
  group: SettingsPageGroup;
  kind: 'single' | 'split';
  description?: string;
  keywords?: string[];
  isAvailable?: (ctx: SettingsRuntimeContext) => boolean;
}

export const SETTINGS_PAGE_METADATA: readonly SettingsPageMeta[] = [
  {
    slug: 'home',
    title: 'Settings',
    group: 'general',
    kind: 'single',
    description: 'Search and jump to common pages.',
    keywords: ['search', 'settings'],
  },
  {
    slug: 'general',
    title: 'General',
    group: 'general',
    kind: 'single',
    keywords: ['general', 'startup', 'launch at login', 'autostart', 'tray', 'password', 'passkey', 'security', 'privacy', 'telemetry', 'transport', 'network', 'lan', 'binary', 'cli'],
  },
  {
    slug: 'projects',
    title: 'Projects',
    group: 'projects',
    kind: 'split',
    keywords: ['project', 'projects', 'worktree', 'worktrees', 'repo', 'repository', 'directory'],
  },
  {
    slug: 'remote-instances',
    title: 'Remote Instances',
    group: 'projects',
    kind: 'single',
    keywords: ['ssh', 'remote', 'instances', 'tunnels', 'forwarding', 'connection'],
  },
  {
    slug: 'providers',
    title: 'Providers',
    group: 'agent',
    kind: 'single',
    keywords: ['provider', 'providers', 'models', 'model', 'api key', 'api keys', 'openai', 'anthropic', 'ollama', 'credentials'],
  },
  {
    slug: 'web-search',
    title: 'Web search',
    group: 'agent',
    kind: 'single',
    keywords: ['web search', 'websearch', 'search', 'internet', 'exa', 'tavily', 'firecrawl', 'parallel', 'tinyfish'],
  },
  {
    slug: 'tools',
    title: 'Tools',
    group: 'agent',
    kind: 'single',
    description: 'Configure agent capabilities: host tools and OMP built-in tools.',
    keywords: ['tools', 'capabilities', 'web', 'browser', 'image', 'generate_image', 'todo', 'grep', 'glob', 'find', 'debug', 'launch', 'speech', 'ratchet', 'archive', 'checkpoint', 'fetch', 'vault', 'github', 'security', 'ask', 'ida'],
  },
  {
    slug: 'memory',
    title: 'Memory',
    group: 'agent',
    kind: 'single',
    description: 'Agent memory backend and options for persistent learnings.',
    keywords: ['memory', 'backend', 'mnemopi', 'hindsight', 'sharpshooter', 'autolearn', 'learnings', 'embeddings', 'recall', 'retain'],
  },
  {
    slug: 'usage',
    title: 'Usage',
    group: 'general',
    kind: 'split',
    keywords: ['quota', 'billing', 'tokens', 'usage', 'limits'],
  },
  {
    slug: 'omp',
    title: 'OMP',
    group: 'agent',
    kind: 'single',
    description: 'Agent behaviour shared with OMP\'s config.yml. Changes apply to new sessions.',
    keywords: ['omp', 'behavior', 'behaviour', 'compaction', 'retry', 'approval', 'thinking', 'budget', 'skills', 'mcp', 'lsp', 'model roles', 'enabled models', 'plan', 'goal'],
  },
  {
    slug: 'behavior',
    title: 'Behavior',
    group: 'agent',
    kind: 'single',
    keywords: ['behavior', 'response style', 'tone', 'instructions', 'custom instructions', 'agents.md', 'global rules', 'project rules'],
  },
  {
    slug: 'agents',
    title: 'Agents',
    group: 'agent',
    kind: 'split',
    keywords: ['agent', 'agents', 'prompts', 'tools', 'permissions'],
  },
  {
    slug: 'commands',
    title: 'Commands',
    group: 'agent',
    kind: 'split',
    keywords: ['command', 'commands', 'slash', 'macros', 'automation'],
  },
  {
    slug: 'mcp',
    title: 'MCP',
    group: 'agent',
    kind: 'single',
    keywords: ['mcp', 'model context protocol', 'servers', 'tools', 'remote', 'stdio'],
  },
  {
    slug: 'plugins',
    title: 'OMP Plugins',
    group: 'agent',
    kind: 'single',
    keywords: ['plugin', 'plugins', 'addons', 'npm', 'opencode-wakatime'],
  },
  {
    slug: 'skills.installed',
    title: 'Skills',
    group: 'content',
    kind: 'split',
    keywords: ['skill', 'skills', 'instructions', 'install', 'catalog'],
  },
  {
    slug: 'skills.catalog',
    title: 'Skills Catalog',
    group: 'content',
    kind: 'single',
    keywords: ['install', 'catalog', 'external', 'repository', 'skills catalog'],
  },
  {
    slug: 'git',
    title: 'Git',
    group: 'projects',
    kind: 'single',
    keywords: ['git', 'github', 'gitlab', 'identity', 'identities', 'ssh', 'profiles', 'credentials', 'keys', 'commit', 'gitmoji', 'oauth', 'prs', 'issues'],
  },
  {
    slug: 'appearance',
    title: 'Appearance',
    group: 'general',
    kind: 'single',
    keywords: ['theme', 'font', 'spacing', 'padding', 'corner radius', 'radius', 'input bar', 'keyboard', 'viewport', 'mobile', 'terminal', 'pwa', 'install name', 'app shortcuts'],
  },
  {
    slug: 'chat',
    title: 'Chat',
    group: 'general',
    kind: 'single',
    keywords: ['tools', 'diff', 'reasoning', 'dotfiles', 'draft', 'queue', 'output', 'copy', 'image', 'split messages', 'message actions'],
  },
  {
    slug: 'shortcuts',
    title: 'Shortcuts',
    group: 'general',
    kind: 'single',
    keywords: ['keyboard', 'hotkeys', 'shortcuts', 'bindings'],
  },
  {
    slug: 'sessions',
    title: 'Sessions',
    group: 'general',
    kind: 'single',
    keywords: ['defaults', 'default agent', 'default model', 'retention', 'memory', 'limits', 'zen'],
  },
  {
    slug: 'routing',
    title: 'Routing',
    group: 'general',
    kind: 'single',
    description: 'Pick the right model for each message automatically, and get asked before risky actions in auto-accepted sessions.',
    keywords: ['routing', 'auto', 'jev', 'typesafe', 'model routing', 'categories', 'safety net', 'auto-accept', 'fallback'],
    isAvailable: (ctx) => ctx.routingAvailable && !ctx.jevBlockedByEnterprise,
  },
  {
    slug: 'magic-prompts',
    title: 'Magic Prompts',
    group: 'content',
    kind: 'split',
    keywords: ['prompts', 'templates', 'git', 'github', 'review', 'commit', 'pull request'],
  },
  {
    slug: 'snippets',
    title: 'Prompt Templates',
    group: 'content',
    kind: 'split',
    keywords: ['prompt', 'templates', 'multi-run', 'strategy', 'approach'],
  },

  { slug: 'notifications', title: 'Notifications', group: 'general', kind: 'single', keywords: ['alerts', 'native', 'summary', 'summarization'], },
<<<<<<< HEAD
  { slug: 'voice', title: 'Voice', group: 'general', kind: 'single', keywords: ['tts', 'speech', 'voice'] },
  { slug: 'tunnel', title: 'External Tunnel', group: 'projects', kind: 'single', keywords: ['tunnel', 'external', 'cloudflare', 'tailscale', 'qr', 'remote', 'mobile', 'share'], isAvailable: (ctx) => !ctx.enterpriseMode },
  { slug: 'about', title: 'About', group: 'general', kind: 'single', keywords: ['about', 'version', 'updates', 'release', 'changelog'] },
  { slug: 'integrations', title: 'Integrations', group: 'general', kind: 'single', keywords: ['integration', 'connect', 'oauth', 'github', 'linear', 'extension', 'claude', 'plugin'] },
||||||| bc50ba56aa
  { slug: 'voice', title: 'Voice', group: 'general', kind: 'single', keywords: ['tts', 'speech', 'voice'], isAvailable: (ctx) => !ctx.isVSCode },
  { slug: 'tunnel', title: 'External Tunnel', group: 'projects', kind: 'single', keywords: ['tunnel', 'external', 'cloudflare', 'tailscale', 'qr', 'remote', 'mobile', 'share'], isAvailable: (ctx) => !ctx.isVSCode && !ctx.enterpriseMode },
  {
    slug: 'isolated-spaces',
    title: 'Isolated spaces',
    group: 'projects',
    kind: 'single',
    keywords: ['isolated', 'space', 'spaces', 'container', 'docker', 'colima', 'sandbox', 'disk', 'clean up', 'image'],
    // Never in VS Code (decision 16 of the design); before the feature's first release only with the key on.
    isAvailable: (ctx) => !ctx.isVSCode && isIsolatedSpacesPageVisible(),
  },
  { slug: 'about', title: 'About', group: 'general', kind: 'single', keywords: ['about', 'version', 'updates', 'release', 'changelog', 'canary', 'channel'], isAvailable: (ctx) => !ctx.isVSCode },
  { slug: 'integrations', title: 'Integrations', group: 'general', kind: 'single', keywords: ['integration', 'connect', 'oauth', 'github', 'linear', 'extension', 'claude', 'plugin'], isAvailable: (ctx) => !ctx.isVSCode },
=======
  { slug: 'voice', title: 'Voice', group: 'general', kind: 'single', keywords: ['tts', 'speech', 'voice'], isAvailable: (ctx) => !ctx.isVSCode },
  { slug: 'tunnel', title: 'External Tunnel', group: 'projects', kind: 'single', keywords: ['tunnel', 'external', 'cloudflare', 'tailscale', 'qr', 'remote', 'mobile', 'share'], isAvailable: (ctx) => !ctx.isVSCode && !ctx.enterpriseMode },
  {
    slug: 'isolated-spaces',
    title: 'Isolated spaces',
    group: 'projects',
    kind: 'single',
    keywords: ['isolated', 'space', 'spaces', 'container', 'docker', 'colima', 'sandbox', 'disk', 'clean up', 'image'],
    isAvailable: (ctx) => !ctx.isVSCode && isIsolatedSpacesPageVisible(),
  },
  { slug: 'about', title: 'About', group: 'general', kind: 'single', keywords: ['about', 'version', 'updates', 'release', 'changelog', 'canary', 'channel'], isAvailable: (ctx) => !ctx.isVSCode },
  { slug: 'integrations', title: 'Integrations', group: 'general', kind: 'single', keywords: ['integration', 'connect', 'oauth', 'github', 'linear', 'extension', 'claude', 'plugin'], isAvailable: (ctx) => !ctx.isVSCode },
>>>>>>> upstream/main
  {
    slug: 'extensions',
    title: 'Guest Extensions',
    group: 'general',
    kind: 'single',
    keywords: ['extension', 'extensions', 'guest', 'panel', 'rail', 'folder', 'zip', 'git', 'url'],
<<<<<<< HEAD
    isAvailable: (ctx) => !ctx.isMobile,
||||||| bc50ba56aa
    isAvailable: (ctx) => !ctx.isVSCode && !ctx.isMobile,
=======
    isAvailable: (ctx) => !ctx.isVSCode,
>>>>>>> upstream/main
  },
] as const;

const LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG: Record<SidebarSection, SettingsPageSlug> = {
  sessions: 'sessions',
  agents: 'agents',
  commands: 'commands',
  mcp: 'mcp',
  skills: 'skills.installed',
  providers: 'providers',
  usage: 'usage',
  'git-identities': 'git',
  settings: 'home',
};

export function getSettingsPageMeta(slug: string): SettingsPageMeta | null {
  const normalized = slug.trim().toLowerCase();
  return (SETTINGS_PAGE_METADATA as readonly SettingsPageMeta[]).find((page) => page.slug === normalized) ?? null;
}

export function resolveSettingsSlug(value: string | null | undefined): SettingsPageSlug {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'home';
  }

  const legacy = (LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG as Record<string, SettingsPageSlug>)[normalized];
  if (legacy) {
    return legacy;
  }

  const direct = getSettingsPageMeta(normalized);
  if (direct) {
    return direct.slug;
  }

  return 'home';
}

export function getSettingsNavIcon(slug: SettingsPageSlug): IconName | null {
  switch (slug) {
    case 'general':
      return 'settings-3';
    case 'projects':
      return 'folders';
    case 'remote-instances':
      return 'computer';
    case 'appearance':
      return 'palette';
    case 'chat':
      return 'chat-ai-3';
    case 'magic-prompts':
      return 'ai-generate-2';
    case 'snippets':
      return 'chat-thread';
    case 'notifications':
      return 'notification-3';
    case 'shortcuts':
      return 'command';
    case 'sessions':
      return 'chat-history';
    case 'routing':
      return 'signpost';

    case 'providers':
      return 'cloud';
    case 'web-search':
      return 'global';
    case 'tools':
      return 'tools';
    case 'memory':
      return 'database-2';
    case 'omp':
      return 'equalizer-2';
    case 'behavior':
      return 'brain';
    case 'agents':
      return 'ai-agent';
    case 'commands':
      return 'slash-commands-2';
    case 'mcp':
      return null;
    case 'plugins':
      return 'plug-2';

    case 'skills.installed':
      return 'book-open';
    case 'skills.catalog':
      return 'book';

    case 'git':
      return 'git-branch';

    case 'integrations':
      return 'plug';
    case 'extensions':
      return 'puzzle';

    case 'usage':
      return 'bar-chart-2';
    case 'voice':
      return 'mic';
    case 'tunnel':
      return 'home-office';
    case 'about':
      return 'information';
    case 'home':
      return null;
    default:
      return 'robot-2';
  }
}
