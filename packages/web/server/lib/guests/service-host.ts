import { AskRequestSchema } from '@openchamber/agent-contract';
import type { AskAnswer, QuestionRequest, RequestCAS, SessionSnapshot } from '@openchamber/agent-contract';

import { guestAuthPersistPath, getGuestAuth } from './auth-store.js';
import { setGuestConfigurationNote } from './catalog.js';
import { createGuestInstructions } from './instructions.js';
import { buildGuestMarksChangedEvent, guestMarks } from './marks.js';
import { createServiceHostApi } from './service-host-api.js';
import type { ServiceHostApiOptions, ServiceHostControl } from './service-host-api.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import type { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

interface GuestServiceHostOptions {
  dataDir: string;
  listGuests: ServiceHostApiOptions['listGuests'];
  control: Pick<ServiceHostControl, 'execute' | 'resolveSessionDirectory'>;
  sessions: {
    open: (sessionId: string) => Promise<SessionSnapshot>;
    control: ReturnType<typeof createOpenChamberSessionService>['control'];
  };
  request: (pathname: string, init: RequestInit) => Promise<Response>;
  broadcast: (event: JsonObject) => void;
}

const cas = ({ version, epoch, workerGeneration }: RequestCAS): RequestCAS => ({ version, epoch, workerGeneration });

const questionResponse = (question: QuestionRequest, values: NonNullable<Parameters<ServiceHostControl['answerForm']>[0]['values']>, message?: string) => {
  if (question.schema?.type !== 'omp.ask') return values;
  const parsed = AskRequestSchema.safeParse(question.schema);
  if (!parsed.success) throw new OpenChamberControlError('The session question has an invalid schema', 502);
  if (Object.keys(values).some(key => !parsed.data.questions.some(control => control.id === key))) {
    throw new OpenChamberControlError('The answer contains an unknown question field', 400);
  }
  return {
    results: parsed.data.questions.map(control => {
      const value = values[control.id];
      const text = value === undefined ? '' : String(value);
      const selected = Array.isArray(value) ? value : value === undefined ? [] : [text];
      const custom = control.options.length === 0 || (!Array.isArray(value) && control.allowCustom && !control.options.some(option => option.label === text));
      const answer: AskAnswer['results'][number] = {
        id: control.id,
        selectedOptions: custom ? [] : selected,
      };
      if (custom) answer.customInput = text;
      if (message) answer.note = message;
      return answer;
    }),
  };
};

export const registerGuestServiceHost = ({ dataDir, listGuests, control, sessions, request, broadcast }: GuestServiceHostOptions) => {
  const respond = async (sessionId: string, kind: 'approvals' | 'questions', id: string, reply: RequestCAS & ({ decision: 'approve' | 'reject' } | { action: 'cancel' } | { action: 'answer'; response: JsonValue })) => {
    const response = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/${kind}/${encodeURIComponent(id)}/respond`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reply),
    });
    if (!response.ok) throw new OpenChamberControlError('The session could not accept the answer', response.status);
  };
  const unregister = createServiceHostApi({
    listGuests,
    control: {
      ...control,
      stopSession: async sessionId => {
        const snapshot = await sessions.open(sessionId);
        if (!snapshot.session.activeRunId) return false;
        await sessions.control(sessionId, { type: 'abort', runId: snapshot.session.activeRunId });
        return true;
      },
      answerPermission: async input => {
        const snapshot = await sessions.open(input.sessionId);
        const approval = snapshot.approvals.find(item => item.approvalId === input.requestId && item.status === 'pending');
        if (!approval) throw new OpenChamberControlError('This permission is no longer waiting for an answer', 404);
        await respond(input.sessionId, 'approvals', approval.approvalId, { ...cas(approval), decision: input.decision === 'allow' ? 'approve' : 'reject' });
      },
      answerForm: async input => {
        const snapshot = await sessions.open(input.sessionId);
        const question = snapshot.questions.find(item => item.questionId === input.formId && item.status === 'pending');
        if (!question) throw new OpenChamberControlError('This question is no longer waiting for an answer', 404);
        await respond(input.sessionId, 'questions', question.questionId, input.values === null
          ? { ...cas(question), action: 'cancel' }
          : { ...cas(question), action: 'answer', response: questionResponse(question, input.values, input.message) });
      },
      dismissOpenForms: async sessionId => {
        const snapshot = await sessions.open(sessionId);
        for (const question of snapshot.questions.filter(item => item.status === 'pending')) {
          await respond(sessionId, 'questions', question.questionId, { ...cas(question), action: 'cancel' });
        }
      },
    },
    instructions: createGuestInstructions({ dataDir }),
    readSettings: async guest => (await getGuestAuth(guest.id, guestAuthPersistPath(dataDir)))?.settings ?? {},
    emitToFrames: (guestId, topic, data) => broadcast({ type: 'openchamber:guest-service-event', properties: { guestId, topic, data: data ?? null } }),
    setConfigurationNote: (guestId, message) => {
      setGuestConfigurationNote(guestId, message);
      broadcast({ type: 'openchamber:guests-changed', properties: {} });
    },
    marks: {
      set: (...args) => {
        const outcome = guestMarks.set(...args);
        if (outcome !== 'changed') return outcome;
        const [guestId, , target] = args;
        const event = buildGuestMarksChangedEvent(guestId, target);
        if (event) broadcast(event);
        else console.warn('Failed to validate a guest marks change announcement for', guestId);
        return outcome;
      },
    },
  }).register();
  return { dispose: unregister };
};
