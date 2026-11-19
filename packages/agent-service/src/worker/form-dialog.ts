import { AskAnswerSchema, AskRequestSchema, type AskQuestion, type JsonObject, JsonObjectSchema } from '@openchamber/agent-contract';
import type { ExtensionFormDialogResult } from '@oh-my-pi/pi-coding-agent/sdk';
import { parseHtmlForm, spansText, type FormBlock, type HtmlForm } from '@oh-my-pi/pi-tui/html-form/parse';
import { choiceValue, defaultFormData, fieldContexts, fieldError, fieldQuestions, textValue } from '@oh-my-pi/pi-tui/html-form/data';

function mediaMarkdown(block: FormBlock): string {
  if (block.kind === 'svg') {
    const fence = '`'.repeat(Math.max(3, ...[...block.markup.matchAll(/`+/g)].map(match => match[0].length + 1)));
    return `${fence}svg\n${block.markup}\n${fence}`;
  }
  if (block.kind !== 'image') return '';
  const src = block.src.trim();
  if (!/^https?:\/\//i.test(src) && !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=]+$/i.test(src)) return block.alt;
  const url = src.replace(/[<>\s()]/g, char => encodeURIComponent(char));
  const alt = block.alt.replace(/[[\]\\]/g, '\\$&');
  return `![${alt}](<${url}>)`;
}

/** Native parsing/values stay in the worker; clients receive only question controls and safe Markdown. */
export class NativeFormDialog {
  readonly form: HtmlForm;
  readonly schema: JsonObject;
  private current: ExtensionFormDialogResult;
  private readonly defaults: ExtensionFormDialogResult;

  constructor(html: string, timeout?: number) {
    this.form = parseHtmlForm(html);
    const fields = this.form.fields.filter(field => field.name);
    if (fields.length === 0) throw new Error('Form requires a named control');
    const contexts = fieldContexts(this.form);
    const questions = fieldQuestions(this.form);
    const mediaByField = new Map<(typeof fields)[number], string[]>();
    let pendingMedia: string[] = [];
    let lastMedia: string[] | undefined;
    for (const section of this.form.sections) {
      pendingMedia.push(...section.blocks.map(mediaMarkdown).filter(Boolean));
      const first = section.blocks.find(block => block.kind === 'field' && block.field.name);
      if (first?.kind === 'field') {
        mediaByField.set(first.field, pendingMedia);
        lastMedia = pendingMedia;
        pendingMedia = [];
      }
    }
    lastMedia?.push(...pendingMedia);
    const controls: AskQuestion[] = fields.map((field, index) => {
      const media = mediaByField.get(field)?.join('\n\n');
      const context = [contexts.get(field), media].filter(Boolean).join('\n\n');
      const base = {
        id: `field-${index}`, question: questions.get(field) || field.name!,
        ...(context ? { context } : {}), required: field.required,
      };
      if (field.kind === 'text') return {
        ...base, options: [], initialInput: field.value, inputType: field.type,
        placeholder: field.placeholder,
      };
      return {
        ...base, multi: field.multi, allowCustom: field.other,
        options: field.options.map((option, optionIndex) => ({
          label: String(optionIndex), displayLabel: spansText(option.label) || option.value, disabled: option.disabled,
        })),
        initialSelected: field.options.flatMap((option, optionIndex) => option.checked && !option.disabled ? [String(optionIndex)] : []),
      };
    });
    this.schema = JsonObjectSchema.parse(AskRequestSchema.parse({ type: 'omp.ask', form: true, questions: controls, ...(timeout ? { timeout } : {}) }));
    this.current = this.defaults = { data: defaultFormData(this.form) };
  }

  update(response: unknown, submit: boolean): boolean {
    const parsed = AskAnswerSchema.safeParse(response);
    const controls = AskRequestSchema.parse(this.schema).questions;
    if (!parsed.success || parsed.data.results.length !== controls.length) return false;
    const data = { ...defaultFormData(this.form) };
    const notes: NonNullable<ExtensionFormDialogResult['notes']> = [];
    const fields = this.form.fields.filter(field => field.name);
    for (const [index, answer] of parsed.data.results.entries()) {
      const field = fields[index]!;
      if (answer.id !== controls[index]!.id || new Set(answer.selectedOptions).size !== answer.selectedOptions.length) return false;
      if (field.kind === 'text') {
        if (answer.selectedOptions.length) return false;
        data[field.name!] = textValue(field, answer.customInput ?? '');
      } else {
        const indices = new Set(answer.selectedOptions.map(label => Number(label)));
        if (answer.selectedOptions.some(label => !/^\d+$/.test(label) || String(Number(label)) !== label)
          || [...indices].some(index => !field.options[index] || field.options[index]!.disabled)
          || (!field.multi && indices.size + (answer.customInput?.trim() ? 1 : 0) > 1)
          || (answer.customInput && !field.other)) return false;
        const value = choiceValue(field, indices, answer.customInput);
        if (value === undefined) delete data[field.name!];
        else data[field.name!] = value;
        if (answer.note?.trim()) for (const optionIndex of indices) {
          const option = field.options[optionIndex]!;
          notes.push({ name: field.name!, question: controls[index]!.question!, option: spansText(option.label), value: option.value, text: answer.note.trim() });
        }
      }
      if (submit && fieldError(field, data[field.name!]) !== undefined) return false;
    }
    this.current = { data, ...(notes.length ? { notes } : {}) };
    return true;
  }

  result(timedOut = false): ExtensionFormDialogResult {
    return { ...this.current, ...(timedOut ? { timedOut: true } : {}) };
  }

  abandoned(): ExtensionFormDialogResult {
    const data = Object.fromEntries(Object.entries(this.current.data).filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(this.defaults.data[name])));
    return { data, ...(this.current.notes ? { notes: this.current.notes } : {}) };
  }
}
