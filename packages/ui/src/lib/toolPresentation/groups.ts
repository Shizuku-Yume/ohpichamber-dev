export type ToolPermissionGroupKey =
  | 'files_and_search'
  | 'execution'
  | 'web_and_external'
  | 'planning_and_memory'
  | 'multi_agent'
  | 'openchamber'
  | 'mcp_and_extensions';

export const TOOL_PERMISSION_GROUPS: readonly ToolPermissionGroupKey[] = [
  'files_and_search',
  'execution',
  'web_and_external',
  'planning_and_memory',
  'multi_agent',
  'openchamber',
  'mcp_and_extensions',
] as const;

export function categorizeTool(name: string): ToolPermissionGroupKey {
  if (name.startsWith('mcp__') || name.startsWith('mcp:') || name.includes('__')) return 'mcp_and_extensions';
  if (name.startsWith('openchamber') || name === 'notify') return 'openchamber';
  if (name.startsWith('vibe_') || name.startsWith('subagent_') || name === 'task' || name === 'wait') {
    return 'multi_agent';
  }
  if (
    ['read', 'write', 'edit', 'apply_patch', 'glob', 'grep', 'find'].includes(name) ||
    name.startsWith('ast_')
  ) {
    return 'files_and_search';
  }
  if (['bash', 'eval', 'debug', 'lsp', 'ida', 'ask', 'security_scan', 'tts'].includes(name)) {
    return 'execution';
  }
  if (['web_search', 'web', 'github'].includes(name)) {
    return 'web_and_external';
  }
  if (
    [
      'todo',
      'checkpoint',
      'rewind',
      'memory',
      'recall',
      'reflect',
      'learn',
      'goal',
      'think',
      'advise',
      'retain',
      'context_notes',
      'new_context',
      'manage_skill',
    ].includes(name) ||
    name.startsWith('memory_')
  ) {
    return 'planning_and_memory';
  }
  return 'mcp_and_extensions';
}

const TOOL_ONE_LINE_DESCRIPTIONS = {
  read: 'Read files, images, archives and structured data sources',
  write: 'Create or overwrite files in the workspace',
  edit: 'Edit files in place with hashline patches',
  apply_patch: 'Apply unified diff patches to files',
  ast_grep: 'Search code using AST patterns',
  ast_edit: 'Perform AST-aware structural code modifications',
  glob: 'Find files matching wildcard patterns',
  grep: 'Search file contents using regular expressions',
  find: 'Describe behavior to find implementing files and ranges',
  bash: 'Execute commands in persistent shell sessions',
  eval: 'Execute code cells in isolated language runtimes',
  debug: 'Debug running processes with DAP',
  lsp: 'Query language server for definitions, types, and diagnostics',
  ida: 'Inspect binaries using IDA Pro integration',
  ask: 'Ask the user clarifying questions during execution',
  security_scan: 'Run automated security scans on code or plans',
  tts: 'Synthesize speech audio from text',
  task: 'Spawn concurrent subagents for delegated tasks',
  wait: 'Observe and barrier on background jobs and services',
  web_search: 'Search the web for documentation and current information',
  web: 'Fetch web pages and inspect browser content',
  github: 'Interact with GitHub issues, PRs, and repositories',
  todo: 'Manage structured task list and phase milestones',
  checkpoint: 'Save session state checkpoint for recovery',
  rewind: 'Rewind conversation to a previous checkpoint',
  context_notes: 'Save concise notes across context compactions',
  new_context: 'Start a fresh context segment for the session',
  goal: 'Manage multi-turn objectives and auto-progression',
  think: 'Internal reasoning and planning step',
  advise: 'Provide structured advisor guidance notes',
  memory_edit: 'Edit stored agent memory entries',
  retain: 'Save durable facts into long-term memory',
  recall: 'Retrieve relevant entries from long-term memory',
  reflect: 'Synthesize insights across stored memories',
  learn: 'Record a reusable lesson from recent experience',
  manage_skill: 'Install, update, or remove agent skills',
  notify: 'Display desktop and in-app notifications',
  openchamber: 'Execute host workspace control actions',
  openchamber_render: 'Render interactive UI components and views',
  openchamber_knowledge: 'Query project documentation and knowledge context',
  openchamber_workflow: 'Run and manage OhPiChamber workflows',
  openchamber_usage: 'Read provider usage limits in this workspace',
  vibe_spawn: 'Start a persistent fast or good worker session',
  vibe_send: 'Message or steer a vibe worker session',
  vibe_wait: 'Wait for running vibe worker sessions to finish a turn',
  vibe_kill: 'Terminate a vibe worker session',
  vibe_list: 'List vibe worker sessions and their states',
} as const;
export function getToolOneLineDescription(name: string): string {
  if (Object.hasOwn(TOOL_ONE_LINE_DESCRIPTIONS, name)) {
    // SAFETY: Object.hasOwn ensures name is a valid key of TOOL_ONE_LINE_DESCRIPTIONS
    return TOOL_ONE_LINE_DESCRIPTIONS[name as keyof typeof TOOL_ONE_LINE_DESCRIPTIONS];
  }
  return '';
}
