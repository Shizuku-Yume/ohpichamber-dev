import { z } from 'zod';
import type { HistoryEntry } from '../routing/history.js';
import type { JevAnswers, JevQuestion, JevRequest } from '../routing/jev.js';

const TURN_END_CONTEXT = 'This is a turn in a chat between a user and an AI coding agent. `request` is the latest user message, `answer` is the agent\'s reply to it, and `history` holds earlier turns, oldest first, only to explain what a short `request` refers to.';
const SEND_CONTEXT = 'This is a message a user just sent to an AI coding agent. `request` is that message and `history` holds earlier turns, oldest first, only to explain what a short `request` refers to.';

interface NoulSpec {
  question: string;
  criteria?: {
    true: string;
    false: string;
  };
}

export interface TurnEndAskFlags {
  open?: boolean;
  wrapUp?: boolean;
  reviewReady?: boolean;
  recap?: boolean;
  nextStep?: boolean;
}

export interface AssistGateDecision {
  recap: boolean;
  suggestion?: boolean;
}

const CHANGE: NoulSpec = {
  question: 'Does `request` ask the agent to change the project: build or add a feature, fix a bug, change code, UI, docs, or configuration, or approve a change the agent proposed so it gets carried out?',
  criteria: {
    true: 'The user wants the project changed: "fix this", "add X", "let\'s redesign Y", "implement the proposed improvements", "go ahead" after a proposed change, or feedback that asks to adjust something the agent just changed.',
    false: 'The user only wants information or an opinion: a question, an explanation, research, a report, a code or PR review, triage, a draft message to send someone, a status summary, running a command to show output, or a git housekeeping step such as commit, push, merge, or sync.',
  },
};

const TOWARD_CHANGE: NoulSpec = {
  question: 'Is the user working toward a concrete change to their project in `request`: asking for a change, reporting a bug or problem in the project, or discussing how something in the project should change?',
  criteria: {
    true: 'Asking to build, fix, change, redesign, or remove something in the project; a bug report, user complaint, error, or broken behaviour of the project, even without the word "fix"; proposing or discussing a concrete change or redesign; approving a proposal ("go ahead", "yes, do it"); feedback on something just changed.',
    false: 'Only wanting to know or understand: how something works, a status catch-up, a code tour, searching history, a PR review or triage, drafting a reply to someone, general questions or opinions, or tasks unrelated to the project; also a bare housekeeping step such as commit, push, merge, or sync.',
  },
};

const WRAP_UP = 'Does this turn close out the work in this conversation: in `request` the user confirms it works or is good, thanks the agent, or asks to commit, push, merge, sync, or release it, without asking for any further change, and `answer` reports that step done?';

const REVIEW_READY: NoulSpec = {
  question: 'Did the agent change the project in this turn, so there are new changes the user could look over now?',
  criteria: {
    true: '`answer` reports that the agent itself edited the project in this turn: implemented, fixed, added, removed, refactored, or rewrote code, UI, docs, tests, or configuration.',
    false: 'The agent only explained, answered a question, investigated, reviewed code or a PR, proposed or planned a change without making it, drafted a message, ran commands to show output, or committed, pushed, or merged changes made earlier; or it failed before changing anything.',
  },
};

const RECAP: NoulSpec = {
  question: 'Is there substantive work or a finding in this conversation worth a one-line reminder later: something the agent changed, fixed, found out, or a decision that was reached?',
  criteria: {
    true: 'The agent changed code, fixed or diagnosed something, answered a real question with a concrete finding, or the user and agent settled a decision.',
    false: 'Only small talk, a greeting, an acknowledgment, a trivial lookup, or a command whose output needs no reminder.',
  },
};


const OPEN_THRESHOLDS = { change: 0.85, towardChange: 0.9 };
const WRAP_UP_THRESHOLD = 0.8;
const REVIEW_READY_THRESHOLD = 0.7;
const RECAP_SKIP_BELOW = 0.3;
const noul = (context: string, { question, criteria }: NoulSpec): JevQuestion => {
  const asked: JevQuestion = { type: 'noul', instructions: [context, question] };
  if (criteria) asked.criteria = criteria;
  return asked;
};

export const buildSendRequest = ({ history, request }: { history: HistoryEntry[]; request: string }): JevRequest => ({
  state: { history, request },
  questions: {
    change: noul(SEND_CONTEXT, CHANGE),
    toward_change: noul(SEND_CONTEXT, TOWARD_CHANGE),
  },
});

export const buildTurnEndRequest = ({ history, request, answer, ask }: {
  history: HistoryEntry[];
  request: string;
  answer: string;
  ask: TurnEndAskFlags;
}): JevRequest | null => {
  const questions: Record<string, JevQuestion> = {};
  if (ask.open) {
    questions.change = noul(TURN_END_CONTEXT, CHANGE);
    questions.toward_change = noul(TURN_END_CONTEXT, TOWARD_CHANGE);
  }
  if (ask.wrapUp) questions.wrap_up = noul(TURN_END_CONTEXT, { question: WRAP_UP });
  if (ask.reviewReady) questions.review_ready = noul(TURN_END_CONTEXT, REVIEW_READY);
  if (ask.recap) questions.recap = noul(TURN_END_CONTEXT, RECAP);

  if (Object.keys(questions).length === 0) return null;
  return { state: { history, request, answer }, questions };
};

const noulAnswer = z.object({ noul: z.number() });
const answerOf = (answers: JevAnswers | null | undefined, id: string): number | null => (
  noulAnswer.safeParse(answers?.[id]).data?.noul ?? null
);

export const decideOpen = (answers: JevAnswers | null | undefined): boolean => {
  const change = answerOf(answers, 'change');
  const towardChange = answerOf(answers, 'toward_change');
  return (change !== null && change >= OPEN_THRESHOLDS.change)
    || (towardChange !== null && towardChange >= OPEN_THRESHOLDS.towardChange);
};

export const decideWrapUp = (answers: JevAnswers | null | undefined): boolean => {
  const score = answerOf(answers, 'wrap_up');
  return score !== null && score >= WRAP_UP_THRESHOLD;
};

export const decideReviewReady = (answers: JevAnswers | null | undefined): boolean => {
  const score = answerOf(answers, 'review_ready');
  return score !== null && score >= REVIEW_READY_THRESHOLD;
};

export const decideAssist = (answers: JevAnswers | null | undefined): AssistGateDecision => {
  const recap = answerOf(answers, 'recap');
  return {
    recap: recap === null || recap >= RECAP_SKIP_BELOW,
  };
};
