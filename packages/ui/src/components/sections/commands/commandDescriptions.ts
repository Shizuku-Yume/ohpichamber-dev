import type { I18nKey } from '@/lib/i18n';
import type { Command } from '@/stores/useCommandsStore';
import { isCommandBuiltIn } from '@/stores/useCommandsStore';

export const BUILTIN_COMMAND_DESCRIPTION_KEYS: Record<string, I18nKey> = {
  compact: 'chat.commandAutocomplete.command.compactDescription',
  shake: 'chat.commandAutocomplete.command.shakeDescription',
  todo: 'chat.commandAutocomplete.command.todoDescription',
  jobs: 'chat.commandAutocomplete.command.jobsDescription',
  usage: 'chat.commandAutocomplete.command.usageDescription',
  context: 'chat.commandAutocomplete.command.contextDescription',
  tools: 'chat.commandAutocomplete.command.toolsDescription',
  handoff: 'chat.commandAutocomplete.command.handoffDescription',
  retry: 'chat.commandAutocomplete.command.retryDescription',
  rename: 'chat.commandAutocomplete.command.renameDescription',
  effort: 'chat.commandAutocomplete.command.effortDescription',
  model: 'chat.commandAutocomplete.command.modelDescription',
  switch: 'chat.commandAutocomplete.command.switchDescription',
  fast: 'chat.commandAutocomplete.command.fastDescription',
  slow: 'chat.commandAutocomplete.command.slowDescription',
  prewalk: 'chat.commandAutocomplete.command.prewalkDescription',
  force: 'chat.commandAutocomplete.command.forceDescription',
  pin: 'chat.commandAutocomplete.command.pinDescription',
  fresh: 'chat.commandAutocomplete.command.freshDescription',
  clear: 'chat.commandAutocomplete.command.clearDescription',
  dirs: 'chat.commandAutocomplete.command.dirsDescription',
  session: 'chat.commandAutocomplete.command.sessionDescription',
  memory: 'chat.commandAutocomplete.command.memoryDescription',
  btw: 'chat.commandAutocomplete.command.btwDescription',
  init: 'chat.commandAutocomplete.command.initDescription',
};

export const getLocalizedCommandDescription = (command: Command, t: (key: I18nKey) => string): string => {
  if (isCommandBuiltIn(command)) {
    const key = BUILTIN_COMMAND_DESCRIPTION_KEYS[command.name];
    if (key) return t(key);
  }
  return command.description;
};
