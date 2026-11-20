import { asNonEmptyString } from '../shared/guards.js';
import { OpenChamberControlError } from './error.js';
import { createPageAnswers } from './render-page.js';
import { createSecretRuns } from './secret-run.js';
import type { PageAnswersOptions } from './render-page.js';
import type { SecretRunContext, SecretRunInput, SecretRunsOptions } from './secret-run.js';

export interface SecretAnswerInput {
  sessionId?: unknown;
  callId?: unknown;
  declined?: unknown;
  values?: unknown;
  remember?: unknown;
}

export const createSecretRequests = ({ isEnabled, onWaitChange, hasUnreadChat = async () => false, leases, run: commandRunner }: {
  isEnabled: () => Promise<boolean>;
  onWaitChange?: PageAnswersOptions['onWaitChange'];
  hasUnreadChat?: SecretRunsOptions['hasUnreadChat'];
  leases?: SecretRunsOptions['leases'];
  run?: SecretRunsOptions['run'];
}) => {
  const waits = createPageAnswers({ onWaitChange });
  const runs = createSecretRuns({ waits, hasUnreadChat, leases, run: commandRunner });
  const request = async () => {
    throw new OpenChamberControlError('secret.request file mode is disabled: secrets must not be saved to disk. Use secret.run to run one approved command with secrets in its environment.', 403);
  };
  const run = async (input: SecretRunInput, context: SecretRunContext) => {
    if (!await isEnabled()) throw new OpenChamberControlError('The secret tool is turned off in OhPiChamber settings', 403);
    return runs.execute(input, context);
  };
  const fields = (input: Pick<SecretAnswerInput, 'sessionId' | 'callId'> = {}) => {
    const sessionId = asNonEmptyString(input.sessionId);
    const callId = asNonEmptyString(input.callId);
    const pending = sessionId && callId ? runs.fieldsFor(sessionId, callId) : null;
    if (!pending) throw new OpenChamberControlError('This request is no longer waiting for a secret', 404);
    return pending;
  };
  const answer = async (input: SecretAnswerInput = {}) => {
    const sessionId = asNonEmptyString(input.sessionId);
    const callId = asNonEmptyString(input.callId);
    if (!sessionId || !callId) throw new OpenChamberControlError('sessionId and callId are required', 400);
    fields({ sessionId, callId });
    const settle = (sessionId: string, callId: string, summary: string, data: null) => {
      waits.answer({ sessionId, callId, summary, data });
    };
    if (input.declined === true) {
      settle(sessionId, callId, 'declined', null);
      return { status: 'declined' };
    }
    return runs.submit(sessionId, callId, input, settle);
  };
  return { request, run, fields, answer, forget: runs.forget };
};
