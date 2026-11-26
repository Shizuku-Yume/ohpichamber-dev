import { describe, expect, test } from 'bun:test';
import {
  QueueAppendRequestSchema,
  QueueDeleteRequestSchema,
  QueueDraftAttachmentSchema,
  QueueItemContentSchema,
  QueueItemSchema,
  QueueOriginalDraftSchema,
  QueueReorderRequestSchema,
  QueueStateSchema,
  QueueTakeRequestSchema,
  QueueTakeResultSchema,
} from './queue.ts';

const options = { providerId: 'provider_1', modelId: 'model_1', agentId: null, variant: 'careful', reasoningEffort: 'medium' };
const attachment = { attachmentId: 'attachment_1', name: 'issue.txt', mediaType: 'text/plain', size: 128, uri: 'attachment://attachment_1' };
const content = {
  queueItemId: 'queue_1',
  content: 'Review @issue',
  text: 'Review the captured issue',
  attachments: [attachment],
  context: [{ index: 0, kind: 'context', hasInstructions: true, deliveryReceiptId: 'receipt_1' }],
  contextPreview: 'Captured issue context',
  agentMention: { agentId: 'agent_1' },
  options,
  createdAt: 1000,
  originalAvailable: true,
};
const draftAttachment = {
  attachmentId: 'attachment_1',
  name: 'issue.txt',
  mediaType: 'text/plain',
  size: 128,
  uri: 'attachment://attachment_1',
  agentPath: '/private/workspace/issue.txt',
  original: { mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,aGVsbG8=', saveOnSend: true },
};
const draft = {
  content: content.content,
  text: content.text,
  attachments: [draftAttachment],
  context: [{ kind: 'context' as const, text: 'Full captured issue', metadata: { issueId: 42 }, instructions: 'Inspect before replying' }],
  agentMention: { agentId: 'agent_1' },
  options,
  goal: { objective: 'Close the issue', tokenBudget: 5000 },
  contextPreview: content.contextPreview,
};
const takeResult = {
  queue: { sessionId: 'session_1', revision: '8', items: [] },
  draft,
  text: content.text,
  content: content.content,
  createdAt: 1000,
};
const queued = { ...content, status: 'queued' };
const leased = { ...content, status: 'leased', lease: { leaseId: 'lease_1', expiresAt: 2000 } };
const state = { sessionId: 'session_1', revision: '7', items: [queued] };
const request = {
  input: {
    text: content.text,
    attachments: [attachment],
    context: [{ kind: 'context' as const, text: 'Full captured issue', metadata: { issueId: 42 }, instructions: 'Inspect before replying', deliveryReceiptId: 'receipt_1' }],
    agentMention: { agentId: 'agent_1' },
  },
  options,
};

const boundaries = [
  {
    name: 'QueueItemContent', schema: QueueItemContentSchema, valid: content,
    invalid: [
      { ...content, options: { providerId: 'provider_1' } },
      { ...content, context: [{ index: 1, kind: 'context', hasInstructions: true }] },
      { ...content, attachments: [{ ...attachment, uri: '/host/private/issue.txt' }] },
      { ...content, contextPreview: 'x'.repeat(101) },
      { ...content, originalAvailable: undefined },
    ],
  },
  {
    name: 'QueueItem', schema: QueueItemSchema, valid: leased,
    invalid: [
      { ...content, status: 'leased' },
      { ...queued, lease: leased.lease },
      { ...leased, lease: { leaseId: 'lease_1', expiresAt: 1000 } },
      { ...queued, status: 'sending' },
    ],
  },
  {
    name: 'QueueState', schema: QueueStateSchema, valid: state,
    invalid: [{ ...state, items: [queued, queued] }, { ...state, revision: '07' }, { ...state, revision: '18446744073709551616' }],
  },
  {
    name: 'QueueAppendRequest', schema: QueueAppendRequestSchema,
    valid: { expectedRevision: '7', content: content.content, contextPreview: content.contextPreview, request, draft },
    invalid: [
      { expectedRevision: '7', content: content.content, request: { ...request, options: { modelId: 'model_1' } } },
      { expectedRevision: 7, content: content.content, request },
      { expectedRevision: '7', content: content.content, request, draft: { ...draft, attachments: [{ ...draftAttachment, original: null }] } },
    ],
  },
  {
    name: 'QueueDraftAttachment', schema: QueueDraftAttachmentSchema,
    valid: draftAttachment,
    invalid: [
      { ...draftAttachment, name: '' },
      { ...draftAttachment, original: { mimeType: 'text/plain' } },
      { ...draftAttachment, agentPath: null },
    ],
  },
  {
    name: 'QueueOriginalDraft', schema: QueueOriginalDraftSchema,
    valid: draft,
    invalid: [
      { ...draft, goal: { objective: 'Close the issue' } },
      { ...draft, options: { providerId: 'provider_1' } },
      { ...draft, context: [{ index: 0, kind: 'context', hasInstructions: true }] },
    ],
  },
  {
    name: 'QueueTakeRequest', schema: QueueTakeRequestSchema,
    valid: { expectedRevision: '7', queueItemId: 'queue_1' },
    invalid: [{ queueItemId: 'queue_1' }, { expectedRevision: '-1', queueItemId: 'queueItem_1' }, { expectedRevision: '7' }],
  },
  {
    name: 'QueueTakeResult', schema: QueueTakeResultSchema,
    valid: takeResult,
    invalid: [
      { ...takeResult, draft: undefined },
      { ...takeResult, queue: { sessionId: 'session_1', revision: '8' } },
      { ...takeResult, createdAt: -1 },
    ],
  },
  {
    name: 'QueueReorderRequest', schema: QueueReorderRequestSchema,
    valid: { expectedRevision: '7', queueItemIds: ['queue_2', 'queue_1'] },
    invalid: [{ expectedRevision: '7', queueItemIds: ['queue_1', 'queue_1'] }, { queueItemIds: ['queue_1'] }],
  },
  {
    name: 'QueueDeleteRequest', schema: QueueDeleteRequestSchema,
    valid: { expectedRevision: '7', queueItemId: 'queue_1' },
    invalid: [{ expectedRevision: '-1', queueItemId: 'queue_1' }, { expectedRevision: '7', queueItemId: '' }],
  },
];

describe('Host durable queue wire boundaries', () => {
  for (const boundary of boundaries) {
    test(`${boundary.name} accepts captured data and rejects contradictory boundaries`, () => {
      expect(boundary.schema.parse(JSON.parse(JSON.stringify(boundary.valid)))).toEqual(boundary.valid);
      for (const invalid of boundary.invalid) expect(boundary.schema.safeParse(invalid).success).toBe(false);
    });
  }

  test('an old append without a draft and an old projection without original availability stay parseable history', () => {
    const append = { expectedRevision: '7', content: content.content, request };
    expect(QueueAppendRequestSchema.parse(JSON.parse(JSON.stringify(append)))).toEqual(append);
    expect(QueueAppendRequestSchema.parse({ ...append, draft }).draft).toEqual(draft);
    expect(QueueTakeResultSchema.parse({ ...takeResult, draft: null }).draft).toBeNull();
    expect(QueueItemSchema.safeParse({ ...queued, originalAvailable: undefined }).success).toBe(false);
  });

  test('the public projection keeps complete immutable configuration but excludes delivery context and transcript copies', () => {
    expect(QueueItemSchema.parse(queued).options).toEqual(options);
    expect(QueueAppendRequestSchema.parse({ expectedRevision: '0', content: '', request }).request.input.context).toEqual(request.input.context);
    for (const invalid of [
      { ...queued, request },
      { ...queued, messages: [{ text: 'copied transcript' }] },
      { ...queued, context: [{ ...content.context[0], text: 'Full captured issue', metadata: { secret: 'not public' } }] },
      { ...queued, options: { ...options, providerId: undefined } },
    ]) expect(QueueItemSchema.safeParse(invalid).success).toBe(false);
  });

  test('null selections and partial provider/model overrides stay explicit rather than synthesized from Composer state', () => {
    const noOverride = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
    expect(QueueItemSchema.parse({ ...queued, options: noOverride }).options).toEqual(noOverride);
    expect(QueueItemSchema.parse({ ...queued, options: { ...noOverride, modelId: 'fixed_model' } }).options.modelId).toBe('fixed_model');
  });

  test('context order, instruction presence and bounded previews cannot contradict the captured descriptors', () => {
    expect(QueueItemSchema.parse({ ...queued, contextPreview: `${'x'.repeat(100)}...` }).contextPreview).toHaveLength(103);
    expect(QueueItemSchema.parse({ ...queued, contextPreview: `${'x'.repeat(100)}…` }).contextPreview).toHaveLength(101);
    expect(QueueItemSchema.safeParse({ ...queued, context: [{ index: 0, kind: 'synthetic', hasInstructions: true }] }).success).toBe(false);
    expect(QueueItemSchema.safeParse({ ...queued, context: [{ index: 0, kind: 'instruction', hasInstructions: false, deliveryReceiptId: 'receipt_1' }] }).success).toBe(false);
    expect(QueueItemSchema.safeParse({ ...queued, context: [{ index: 0, kind: 'context', hasInstructions: false }, { index: 0, kind: 'context', hasInstructions: false }] }).success).toBe(false);
  });
});
