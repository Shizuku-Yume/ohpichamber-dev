import { describe, expect, test } from 'bun:test';
import { AttachmentSchema, CapturedSendOptionsSchema, PromptAttachmentSchema, PromptContextSchema, PromptInputSchema, PromptRequestSchema } from './prompt.ts';

const nullableOptions = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
const completeOptions = { providerId: 'provider', modelId: 'model', agentId: 'agent', variant: 'v1', reasoningEffort: 'high' };
const partialProviderModelOptions = { providerId: 'provider', modelId: null, agentId: null, variant: null, reasoningEffort: null };
const attachment = { attachmentId: 'a1', name: 'file', mediaType: 'text/plain', size: 2, uri: 'attachment://a1' };

describe('prompt wire schemas', () => {
  test('round-trips complete, nullable, and partial provider/model options', () => {
    expect(CapturedSendOptionsSchema.parse(completeOptions)).toEqual(completeOptions);
    expect(CapturedSendOptionsSchema.parse(nullableOptions)).toEqual(nullableOptions);
    expect(CapturedSendOptionsSchema.parse(partialProviderModelOptions)).toEqual(partialProviderModelOptions);
  });

  test('rejects invalid values for every captured nullable field', () => {
    expect(CapturedSendOptionsSchema.safeParse({ ...nullableOptions, providerId: 1 }).success).toBe(false);
    expect(CapturedSendOptionsSchema.safeParse({ ...nullableOptions, modelId: 1 }).success).toBe(false);
    expect(CapturedSendOptionsSchema.safeParse({ ...nullableOptions, agentId: 1 }).success).toBe(false);
    expect(CapturedSendOptionsSchema.safeParse({ ...nullableOptions, variant: 1 }).success).toBe(false);
    expect(CapturedSendOptionsSchema.safeParse({ ...nullableOptions, reasoningEffort: 1 }).success).toBe(false);
  });

  test('round-trips attachments and enforces URI identity and timestamp boundaries', () => {
    expect(PromptAttachmentSchema.parse(attachment)).toEqual(attachment);
    expect(AttachmentSchema.parse({ ...attachment, createdAt: 0 })).toEqual({ ...attachment, createdAt: 0 });
    expect(PromptAttachmentSchema.safeParse({ ...attachment, uri: 'attachment://other' }).success).toBe(false);
    expect(AttachmentSchema.safeParse({ ...attachment, createdAt: -1 }).success).toBe(false);
    expect(AttachmentSchema.safeParse({ ...attachment, createdAt: 1.5 }).success).toBe(false);
  });

  test('round-trips every context variant and preserves input and request values', () => {
    const context = [
      { kind: 'context', text: 'c', metadata: {}, instructions: 'i', deliveryReceiptId: 'r' },
      { kind: 'instruction', text: 'i' },
      { kind: 'synthetic', text: 's' },
    ];
    for (const item of context) expect(PromptContextSchema.parse(item)).toEqual(item);
    expect(PromptContextSchema.safeParse({ kind: 'instruction', text: 'i', extra: true }).success).toBe(false);

    const input = { text: 'hello', attachments: [attachment], context, agentMention: { agentId: 'a' } };
    const request = { input, options: completeOptions };
    expect(PromptInputSchema.parse(input)).toEqual(input);
    expect(PromptRequestSchema.parse(request)).toEqual(request);
    expect(PromptInputSchema.safeParse({ ...input, extra: true }).success).toBe(false);
    expect(PromptRequestSchema.safeParse({ ...request, options: { ...completeOptions, modelId: 1 } }).success).toBe(false);
  });
});
