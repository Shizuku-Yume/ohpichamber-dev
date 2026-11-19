<<<<<<< HEAD
/**
 * Ambiguous transport failures.
 *
 * When a request dies after it was already handed to the transport, the client
 * knows the response was lost — it does NOT know whether the server processed
 * the request. Over the relay tunnel this is the common case: a reconnect, a
 * host-side stream abort, or a dead channel all fail an in-flight POST that may
 * already be running server-side.
 *
 * Callers must be able to tell that state apart from a definite failure, and
 * string-matching the message text is not a contract — a renamed abort reason
 * silently reclassifies a send. Transports therefore tag these errors, and
 * callers read the tag (see `isAmbiguousTransportFailure`).
 *
 * `prompt_async` is the motivating case: treating an ambiguous failure as a
 * definite one rolls back the user message and lets the queue re-send a prompt
 * the engine is already answering, producing two independent AI responses.
 */

||||||| bc50ba56aa
/**
 * Ambiguous transport failures.
 *
 * When a request dies after it was already handed to the transport, the client
 * knows the response was lost — it does NOT know whether the server processed
 * the request. Over the relay tunnel this is the common case: a reconnect, a
 * host-side stream abort, or a dead channel all fail an in-flight POST that may
 * already be running server-side. A plain fetch is no different: a rejection or
 * a body that dies mid-read leaves the same question, and the SDK boundary tags
 * it there (see `normalizeOpencodeError`).
 *
 * Callers must be able to tell that state apart from a definite failure, and
 * string-matching the message text is not a contract — a renamed abort reason
 * silently reclassifies a send. Transports therefore tag these errors, and
 * callers read the tag (see `isAmbiguousTransportFailure`).
 *
 * `prompt_async` is the motivating case: treating an ambiguous failure as a
 * definite one rolls back the user message and lets the queue re-send a prompt
 * the engine is already answering, producing two independent AI responses.
 */

=======
>>>>>>> upstream/main
const AMBIGUOUS_TRANSPORT_FLAG = '__openchamberAmbiguousTransport';
const definiteRejections = new WeakSet<Error>();

<<<<<<< HEAD
||||||| bc50ba56aa
/** A routing response proves the request never reached its intended API. */
export const markDefiniteTransportFailure = <T extends Error>(error: T): T => {
  definiteRejections.add(error);
  return error;
};

=======
export const markDefiniteTransportFailure = <T extends Error>(error: T): T => {
  definiteRejections.add(error);
  return error;
};

>>>>>>> upstream/main
export const isDefiniteTransportFailure = (error: Error): boolean => definiteRejections.has(error);

export const markAmbiguousTransportFailure = <T extends Error>(error: T): T => {
  Object.defineProperty(error, AMBIGUOUS_TRANSPORT_FLAG, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return error;
};

export const isAmbiguousTransportFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)[AMBIGUOUS_TRANSPORT_FLAG] === true;
};
