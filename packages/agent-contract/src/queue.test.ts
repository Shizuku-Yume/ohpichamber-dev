import { describe, expect, test } from 'bun:test';
import {
  QueueAppendRequestSchema,
  QueueDeleteRequestSchema,
  QueueItemContentSchema,
  QueueItemSchema,
  QueueReorderRequestSchema,
  QueueStateSchema,
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
};
const queued = { ...content, status: 'queued' };
const leased = { ...content, status: 'leased', lease: { leaseId: 'lease_1', expiresAt: 2000 } };
const state = { sessionId: 'session_1', revision: '7', items: [queued] };
const request = {
  input: {
    text: content.text,
    attachments: [attachment],
    context: [{ kind: 'context', text: 'Full captured issue', metadata: { issueId: 42 }, instructions: 'Inspect before replying', deliveryReceiptId: 'receipt_1' }],
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
    valid: { expectedRevision: '7', content: content.content, contextPreview: content.contextPreview, request },
    invalid: [
      { expectedRevision: '7', content: content.content, request: { ...request, options: { modelId: 'model_1' } } },
      { expectedRevision: 7, content: content.content, request },
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
