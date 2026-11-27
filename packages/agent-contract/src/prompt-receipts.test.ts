import { describe, expect, test } from 'bun:test';
import {
  AcceptedPromptReceiptSchema,
  PromptReceiptOperationSchema,
  PromptReceiptResultSchema,
  PromptReceiptSchema,
  RejectedPromptReceiptSchema,
} from './prompt-receipts.ts';

const accepted = {
  outcome: 'accepted',
  correlationId: 'corr_1',
  sessionId: 'session_1',
  operation: 'send',
  runId: 'run_1',
  acceptedAt: 1000,
  expiresAt: 1000 + 24 * 60 * 60 * 1000,
};
const acceptedWithMessage = { ...accepted, userMessageId: 'message_1' };
const steerAccepted = { ...accepted, operation: 'steer' };
const followUpAccepted = { ...accepted, operation: 'followUp' };
const rejected = {
  outcome: 'rejected',
  correlationId: 'corr_1',
  sessionId: 'session_1',
  operation: 'send',
  code: 'RUN_ACTIVE',
  detail: 'A run is already active on this session.',
  rejectedAt: 1000,
  expiresAt: 1000 + 24 * 60 * 60 * 1000,
};

const boundaries = [
  {
    name: 'PromptReceipt accepted', schema: PromptReceiptSchema, valid: accepted,
    invalid: [
      { ...accepted, extra: true },
      { ...accepted, runId: undefined },
      { ...accepted, outcome: 'rejected' },
      { ...accepted, correlationId: '' },
      { ...accepted, operation: 'replay' },
      { ...accepted, acceptedAt: -1 },
      { ...accepted, acceptedAt: 1.5 },
      { ...accepted, expiresAt: accepted.acceptedAt },
      { ...accepted, expiresAt: accepted.acceptedAt - 1 },
    ],
  },
  {
    name: 'PromptReceipt accepted with userMessageId', schema: PromptReceiptSchema, valid: acceptedWithMessage,
    invalid: [{ ...acceptedWithMessage, userMessageId: '' }],
  },
  {
    name: 'PromptReceipt accepted steer', schema: PromptReceiptSchema, valid: steerAccepted,
    invalid: [],
  },
  {
    name: 'PromptReceipt accepted followUp', schema: PromptReceiptSchema, valid: followUpAccepted,
    invalid: [],
  },
  {
    name: 'PromptReceipt rejected', schema: PromptReceiptSchema, valid: rejected,
    invalid: [
      { ...rejected, extra: true },
      { ...rejected, code: 'NOT_A_PROBLEM_CODE' },
      { ...rejected, code: 'run_active' },
      { ...rejected, detail: '' },
      { ...rejected, outcome: 'accepted' },
      { ...rejected, expiresAt: rejected.rejectedAt },
      { ...rejected, expiresAt: rejected.rejectedAt - 1 },
      { ...rejected, runId: 'run_1' },
    ],
  },
];

describe('prompt receipt wire schemas', () => {
  for (const boundary of boundaries) {
    test(`${boundary.name} accepts captured data and rejects contradictory boundaries`, () => {
      expect(boundary.schema.parse(JSON.parse(JSON.stringify(boundary.valid)))).toEqual(boundary.valid);
      for (const invalid of boundary.invalid) expect(boundary.schema.safeParse(invalid).success).toBe(false);
    });
  }

  test('operation enum covers exactly send, steer and followUp', () => {
    for (const operation of ['send', 'steer', 'followUp']) {
      expect(PromptReceiptOperationSchema.parse(operation)).toBe(operation);
    }
    expect(PromptReceiptOperationSchema.safeParse('queue').success).toBe(false);
    expect(PromptReceiptOperationSchema.safeParse('').success).toBe(false);
  });

  test('variant schemas match the discriminated union members', () => {
    expect(AcceptedPromptReceiptSchema.parse(accepted)).toEqual(accepted);
    expect(RejectedPromptReceiptSchema.parse(rejected)).toEqual(rejected);
    expect(AcceptedPromptReceiptSchema.safeParse(rejected).success).toBe(false);
    expect(RejectedPromptReceiptSchema.safeParse(accepted).success).toBe(false);
    expect(AcceptedPromptReceiptSchema.safeParse({ ...accepted, expiresAt: accepted.acceptedAt }).success).toBe(false);
    expect(RejectedPromptReceiptSchema.safeParse({ ...rejected, expiresAt: rejected.rejectedAt }).success).toBe(false);
  });
});

describe('prompt receipt result schema', () => {
  const acceptedResult = { status: 'accepted', receipt: accepted };
  const rejectedResult = { status: 'rejected', receipt: rejected };
  const unknownResult = { status: 'unknown', correlationId: 'corr_1', sessionId: 'session_1' };

  test('round-trips each status variant', () => {
    expect(PromptReceiptResultSchema.parse(acceptedResult)).toEqual(acceptedResult);
    expect(PromptReceiptResultSchema.parse(rejectedResult)).toEqual(rejectedResult);
    expect(PromptReceiptResultSchema.parse(unknownResult)).toEqual(unknownResult);
  });

  test('rejects mismatched status and receipt outcome pairings', () => {
    expect(PromptReceiptResultSchema.safeParse({ status: 'accepted', receipt: rejected }).success).toBe(false);
    expect(PromptReceiptResultSchema.safeParse({ status: 'rejected', receipt: accepted }).success).toBe(false);
    expect(PromptReceiptResultSchema.safeParse({ ...unknownResult, receipt: accepted }).success).toBe(false);
  });

  test('rejects extra keys and malformed variants', () => {
    expect(PromptReceiptResultSchema.safeParse({ ...acceptedResult, extra: true }).success).toBe(false);
    expect(PromptReceiptResultSchema.safeParse({ ...unknownResult, extra: true }).success).toBe(false);
    expect(PromptReceiptResultSchema.safeParse({ status: 'unknown' }).success).toBe(false);
    expect(PromptReceiptResultSchema.safeParse({ status: 'pending', correlationId: 'corr_1', sessionId: 'session_1' }).success).toBe(false);
    expect(PromptReceiptResultSchema.safeParse({ status: 'accepted' }).success).toBe(false);
  });

  test('rejects expired receipts nested inside a result', () => {
    const expired = { ...accepted, expiresAt: accepted.acceptedAt };
    expect(PromptReceiptResultSchema.safeParse({ status: 'accepted', receipt: expired }).success).toBe(false);
  });
});
