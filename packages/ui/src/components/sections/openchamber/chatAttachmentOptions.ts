import type { I18nKey } from '@/lib/i18n';
import type { DocumentAttachBehavior, LargeTextPasteBehavior } from '@/stores/useUIStore';

type AttachmentOption<T extends string> = { id: T; labelKey: I18nKey };

export const LARGE_TEXT_PASTE_BEHAVIOR_OPTIONS: AttachmentOption<LargeTextPasteBehavior>[] = [
  { id: 'ask', labelKey: 'settings.openchamber.visual.option.largeTextPaste.ask.label' },
  { id: 'attach', labelKey: 'settings.openchamber.visual.option.largeTextPaste.attach.label' },
  { id: 'inline', labelKey: 'settings.openchamber.visual.option.largeTextPaste.inline.label' },
  { id: 'inline-double-paste', labelKey: 'settings.openchamber.visual.option.largeTextPaste.inlineDoublePaste.label' },
];

export const DOCUMENT_ATTACH_BEHAVIOR_OPTIONS: AttachmentOption<DocumentAttachBehavior>[] = [
  { id: 'ask', labelKey: 'settings.openchamber.visual.option.documentAttach.ask.label' },
  { id: 'save', labelKey: 'settings.openchamber.visual.option.documentAttach.save.label' },
  { id: 'convert', labelKey: 'settings.openchamber.visual.option.documentAttach.convert.label' },
];
