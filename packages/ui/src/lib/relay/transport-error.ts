const AMBIGUOUS_TRANSPORT_FLAG = '__openchamberAmbiguousTransport';
const definiteRejections = new WeakSet<Error>();

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
