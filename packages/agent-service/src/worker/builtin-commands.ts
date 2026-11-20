import { executeAcpBuiltinSlashCommand } from '@oh-my-pi/pi-coding-agent/slash-commands/acp-builtins';
import { parseSlashCommand } from '@oh-my-pi/pi-coding-agent/slash-commands/helpers/parse';

export const ALLOWED_BUILTIN_COMMANDS = [
  'compact',
  'shake',
  'todo',
  'jobs',
  'usage',
  'context',
  'tools',
  'handoff',
  'retry',
  'rename',
  'effort',
  'model',
  'switch',
  'fast',
  'slow',
  'prewalk',
  'force',
  'pin',
  'fresh',
  'clear',
  'dirs',
  'session',
  'memory',
  'loop',
  'omfg',
  'cleanse',
  'tan',
  'advisor',
  'unpin',
] as const;
const READ_ONLY_BUILTIN_COMMANDS = {
  todo: true,
  jobs: true,
  usage: true,
  context: true,
  tools: true,
  dirs: true,
  session: true,
} satisfies Partial<Record<typeof ALLOWED_BUILTIN_COMMANDS[number], true>>;

export function isAllowedBuiltinCommand(name: string): boolean {
  return ALLOWED_BUILTIN_COMMANDS.some(command => command === name);
}

export function isReadOnlyBuiltinCommand(name: string): boolean {
  return Object.hasOwn(READ_ONLY_BUILTIN_COMMANDS, name);
}

export { executeAcpBuiltinSlashCommand, parseSlashCommand };
