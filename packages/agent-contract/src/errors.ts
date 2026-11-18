import { z } from 'zod';
import { JsonObjectSchema } from './primitives.ts';

export const ProblemCodeSchema = z.enum([
  'SERVICE_UNAVAILABLE', 'UNAUTHORIZED', 'INTERNAL_ERROR', 'INVALID_ORIGIN', 'enterprise_mode',
  'UNSUPPORTED_MEDIA_TYPE', 'INVALID_REQUEST', 'NOT_IMPLEMENTED',
  'SESSION_NOT_FOUND', 'RUN_ACTIVE', 'RUN_NOT_FOUND', 'APPROVAL_NOT_FOUND', 'QUESTION_NOT_FOUND',
  'APPROVAL_CONFLICT', 'QUESTION_CONFLICT', 'APPROVAL_EXPIRED', 'QUESTION_EXPIRED',
  'IDEMPOTENCY_CONFLICT', 'COMMAND_IN_FLIGHT', 'RESYNC_REQUIRED', 'INVALID_CURSOR',
  'SESSION_BRANCH_CONFLICT', 'SESSION_RELOCATION_CONFLICT', 'SESSION_READ_ONLY',
  'UNSUPPORTED_CAPABILITY', 'SESSION_RESTORE_FAILED', 'PAYLOAD_TOO_LARGE',
  'METADATA_CONFLICT', 'QUEUE_CONFLICT', 'CATALOG_CONFLICT', 'APPROVAL_POLICY_WRITE_FAILED',
  'METADATA_CORRUPT', 'METADATA_READ_FAILED', 'METADATA_WRITE_FAILED',
  'MCP_CONFIG_WRITE_FAILED', 'MCP_APPLY_FAILED', 'MCP_RECONNECT_FAILED', 'SKILL_INSTALL_FAILED', 'SKILL_APPLY_FAILED',
  'MCP_CONFIG_READ_FAILED', 'MCP_CREDENTIAL_UNAVAILABLE', 'WORKER_GENERATION_CONFLICT',
  'MCP_OAUTH_FAILED', 'MCP_OAUTH_CANCELLED', 'MCP_OAUTH_NOT_FOUND',
  'MCP_OAUTH_IN_PROGRESS', 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED',
  'MODEL_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'PROVIDER_FAILURE', 'CONTEXT_LIMIT', 'STRUCTURED_OUTPUT_INVALID',
  'COMPLETION_NOT_FOUND', 'PROVIDER_CONFIG_WRITE_FAILED', 'MODEL_CONFIG_WRITE_FAILED', 'CREDENTIAL_WRITE_FAILED',
  'CREDENTIAL_UNAVAILABLE', 'OAUTH_REAUTH_REQUIRED',
  'SHELL_NOT_FOUND', 'SHELL_OUTPUT_UNAVAILABLE', 'SHELL_STOP_TIMEOUT', 'SESSION_TOO_SMALL',
]);
export type ProblemCode = z.infer<typeof ProblemCodeSchema>;
export const ProblemDetailsSchema = z.strictObject({
  type: z.string(), title: z.string().min(1), status: z.number().int().min(400).max(599),
  detail: z.string().min(1), code: ProblemCodeSchema, retryable: z.boolean(),
  instance: z.string().optional(), details: JsonObjectSchema.optional(),
}).refine((problem) => problem.type === `urn:ohpichamber:problem:${problem.code}`, {
  message: 'Problem type must identify its code', path: ['type'],
}).refine((problem) => {
  switch (problem.code) {
    case 'APPROVAL_CONFLICT': case 'QUESTION_CONFLICT': case 'METADATA_CONFLICT':
    case 'QUEUE_CONFLICT': case 'CATALOG_CONFLICT': case 'COMMAND_IN_FLIGHT': return problem.status === 409;
    case 'SESSION_BRANCH_CONFLICT': case 'SESSION_RELOCATION_CONFLICT': case 'SESSION_READ_ONLY': return problem.status === 409;
    case 'WORKER_GENERATION_CONFLICT': case 'MCP_OAUTH_CANCELLED': case 'MCP_OAUTH_IN_PROGRESS': return problem.status === 409;
    case 'MCP_OAUTH_NOT_FOUND': return problem.status === 404;
    case 'MCP_CREDENTIAL_UNAVAILABLE': return problem.status === 422;
    case 'MCP_OAUTH_FAILED': return problem.status === 422 || problem.status === 502;
    case 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED': return problem.status === 403 || problem.status === 422;
    case 'MCP_CONFIG_READ_FAILED': return problem.status === 503;
    case 'APPROVAL_EXPIRED': case 'QUESTION_EXPIRED': case 'RESYNC_REQUIRED': return problem.status === 410;
    case 'INVALID_CURSOR': case 'IDEMPOTENCY_CONFLICT': return problem.status === 400;
    case 'APPROVAL_POLICY_WRITE_FAILED': return problem.status === 503;
    default: return true;
  }
}, { message: 'Problem status must match the specified protocol status', path: ['status'] });
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
