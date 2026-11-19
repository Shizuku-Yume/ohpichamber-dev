import React from 'react';

import type { ToolCallPart, ToolResultPart, TextPart } from '@openchamber/agent-contract';
import AssistantTextPart from './AssistantTextPart';
import { PageAskStatus } from './PageAskStatus';
import { generatedImagePaths, isSettledAsk, proposedWorkflowRunId, renderedPage, requestedSecret } from './pageRenderView';
import { WorkflowRunCard } from '@/components/chat/workflows/WorkflowRunCard';
import type { ToolPopupContent } from '../types';
import { GeneratedImages } from './GeneratedImages';
import { ShownPage } from './HtmlRenderFrame';
import { SecretRequestCard } from './SecretRequestCard';
import { toToolView, type CanonicalToolView } from './toolView';

<<<<<<< HEAD
/**
 * What a call the chat shows in place (`isShownInPlace`) draws instead of its
 * row: the run a `workflow.run` call proposed, the images `image.generate`
 * made, the card a secret request asks on, else the page it showed.
 *
 * The canonical contract keeps a call's arguments and its result in separate
 * parts; `toToolView` joins them for these cards, which is the only place the
 * join is needed.
 */
export function ShownToolCard({ part, result, sessionId, messageId, onShowPopup }: {
    part: ToolCallPart;
    result?: ToolResultPart;
    sessionId: string;
    messageId: string;
    onShowPopup?: (content: ToolPopupContent) => void;
}) {
    const view = React.useMemo(
        () => toToolView(part, result, { sessionID: sessionId, messageID: messageId }),
        [part, result, sessionId, messageId],
    );
    const runId = React.useMemo(() => proposedWorkflowRunId(view), [view]);
    const images = React.useMemo(() => generatedImagePaths(view), [view]);
    const secret = React.useMemo(() => requestedSecret(view), [view]);
    if (runId) return <WorkflowRunCard sessionId={sessionId} runId={runId} />;
    if (images.length > 0) return <GeneratedImages part={view} paths={images} onShowPopup={onShowPopup} />;
    if (secret) return <SecretRequestCard part={view} request={secret} />;
    return <ShownPage part={view} />;
||||||| bc50ba56aa
/**
 * What a call the chat shows in place (`isShownInPlace`) draws instead of its
 * row: the run a `workflow.run` call proposed, the images `image.generate`
 * made, the card a secret request asks on, else the page it showed.
 */
export function ShownToolCard({ part, onShowPopup }: { part: ToolPart; onShowPopup?: (content: ToolPopupContent) => void }) {
  const runId = React.useMemo(() => proposedWorkflowRunId(part.tool, part.state), [part.tool, part.state]);
  const images = React.useMemo(() => generatedImagePaths(part.tool, part.state), [part.tool, part.state]);
  const secret = React.useMemo(() => requestedSecret(part.tool, part.state), [part.tool, part.state]);
  const secretRun = React.useMemo(() => requestedSecretRun(part.tool, part.state), [part.tool, part.state]);
  if (runId) return <WorkflowRunCard sessionId={part.sessionID} runId={runId} />;
  if (images.length > 0) return <GeneratedImages part={part} paths={images} onShowPopup={onShowPopup} />;
  if (secret) return <SecretRequestCard part={part} request={secret} />;
  if (secretRun) return <SecretRunCard part={part} run={secretRun} />;
  return <ShownPage part={part} />;
=======
export function ShownToolCard({ part, onShowPopup }: { part: ToolPart; onShowPopup?: (content: ToolPopupContent) => void }) {
  const runId = React.useMemo(() => proposedWorkflowRunId(part.tool, part.state), [part.tool, part.state]);
  const images = React.useMemo(() => generatedImagePaths(part.tool, part.state), [part.tool, part.state]);
  const secret = React.useMemo(() => requestedSecret(part.tool, part.state), [part.tool, part.state]);
  const secretRun = React.useMemo(() => requestedSecretRun(part.tool, part.state), [part.tool, part.state]);
  if (runId) return <WorkflowRunCard sessionId={part.sessionID} runId={runId} />;
  if (images.length > 0) return <GeneratedImages part={part} paths={images} onShowPopup={onShowPopup} />;
  if (secret) return <SecretRequestCard part={part} request={secret} />;
  if (secretRun) return <SecretRunCard part={part} run={secretRun} />;
  return <ShownPage part={part} />;
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** A settled form a collapsed Activity keeps in view: one line, no form. */
function SettledAskLine({ view }: { view: CanonicalToolView }) {
    const page = React.useMemo(() => renderedPage(view), [view]);
    if (!page) return null;
    return (
        <div className="my-2">
            <PageAskStatus ask={page.ask} answeredSummary={page.ask.kind === 'answered' ? page.ask.summary : undefined} />
        </div>
    );
||||||| bc50ba56aa
/** A settled form a collapsed Activity keeps in view: one line, no form. */
function SettledAskLine({ part }: { part: ToolPart }) {
  const page = React.useMemo(() => renderedPage(part.tool, part.state), [part.tool, part.state]);
  if (!page) return null;
  return (
    <div className="my-2">
      <PageAskStatus ask={page.ask} answeredSummary={page.ask.kind === 'answered' ? page.ask.summary : undefined} />
    </div>
  );
=======
function SettledAskLine({ part }: { part: ToolPart }) {
  const page = React.useMemo(() => renderedPage(part.tool, part.state), [part.tool, part.state]);
  if (!page) return null;
  return (
    <div className="my-2">
      <PageAskStatus ask={page.ask} answeredSummary={page.ask.kind === 'answered' ? page.ask.summary : undefined} />
    </div>
  );
>>>>>>> upstream/main
}

<<<<<<< HEAD
/** Something a turn showed the user that a collapsed Activity never folds away. */
export type ShownPart = ToolCallPart | TextPart;

/**
 * A part a collapsed Activity keeps in view (`getShownPages`): a call drawn in
 * place, the line of a settled form, or the text with a UI block the agent
 * wrote before a later step.
 */
export function ShownPartCard({ part, result, sessionId, messageId, streamPhase, onShowPopup }: {
    part: ShownPart;
    result?: ToolResultPart;
    sessionId: string;
    messageId: string;
    streamPhase?: 'streaming' | 'completed';
    onShowPopup?: (content: ToolPopupContent) => void;
}) {
    if (part.type === 'tool_call') {
        const view = toToolView(part, result, { sessionID: sessionId, messageID: messageId });
        if (isSettledAsk(view)) return <SettledAskLine view={view} />;
        return <ShownToolCard part={part} result={result} sessionId={sessionId} messageId={messageId} onShowPopup={onShowPopup} />;
    }
    return (
        <AssistantTextPart
            part={part}
            sessionId={sessionId}
            messageId={messageId}
            streamPhase={streamPhase ?? 'completed'}
            onShowPopup={onShowPopup}
        />
    );
||||||| bc50ba56aa
/**
 * A part a collapsed Activity keeps in view (`getShownPages`): a call drawn in
 * place, the line of a settled form, or the text with a UI block the agent
 * wrote before a later step.
 */
export function ShownPartCard({ part, onShowPopup }: { part: ShownPart; onShowPopup?: (content: ToolPopupContent) => void }) {
  if (part.type === 'tool') {
    if (isSettledAsk(part)) return <SettledAskLine part={part} />;
    return <ShownToolCard part={part} onShowPopup={onShowPopup} />;
  }
  return (
    <AssistantTextPart
      part={part}
      sessionId={part.sessionID}
      messageId={part.messageID}
      streamPhase={part.time?.end === undefined ? 'streaming' : 'completed'}
      onShowPopup={onShowPopup}
    />
  );
=======
export function ShownPartCard({ part, onShowPopup }: { part: ShownPart; onShowPopup?: (content: ToolPopupContent) => void }) {
  if (part.type === 'tool') {
    if (isSettledAsk(part)) return <SettledAskLine part={part} />;
    return <ShownToolCard part={part} onShowPopup={onShowPopup} />;
  }
  return (
    <AssistantTextPart
      part={part}
      sessionId={part.sessionID}
      messageId={part.messageID}
      streamPhase={part.time?.end === undefined ? 'streaming' : 'completed'}
      onShowPopup={onShowPopup}
    />
  );
>>>>>>> upstream/main
}
