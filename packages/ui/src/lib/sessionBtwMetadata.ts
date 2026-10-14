import type { Session, SessionMetadata } from '@openchamber/agent-contract';


type BtwMetadata = NonNullable<SessionMetadata['openchamber']>;
const getOpenChamberMetadata = (metadata: SessionMetadata): BtwMetadata => metadata.openchamber ?? {};
const nonEmpty = (value: string | undefined): string | null => value && value.trim().length > 0 ? value : null;

export const getBtwSessionID = (session: Session | null | undefined): string | null => nonEmpty(session?.metadata?.openchamber?.btwSessionID);
export const wasPromotedBtwSession = (session: Session | null | undefined): boolean => session?.metadata?.openchamber?.btwPromoted === true;
export const isBtwSession = (session: Session | null | undefined): boolean => session?.metadata?.openchamber?.kind === 'btw' && getBtwOriginalSessionID(session) !== null;
export const getBtwOriginalSessionID = (session: Session | null | undefined): string | null => {
  const openchamber = session?.metadata?.openchamber;
  return openchamber?.kind === 'btw' ? nonEmpty(openchamber.originalSessionID) : null;
};
export const getBtwBoundaryMessageID = (session: Session | null | undefined): string | null => {
  const openchamber = session?.metadata?.openchamber;
  return openchamber?.kind === 'btw' ? nonEmpty(openchamber.btwBoundaryMessageID) : null;
};

export const withBtwSessionLink = (metadata: SessionMetadata, btwSessionID: string): SessionMetadata => ({
  ...metadata, openchamber: { ...getOpenChamberMetadata(metadata), btwSessionID },
});

export const withBtwSessionMarker = (metadata: SessionMetadata, originalSessionID: string, boundaryMessageID: string | null): SessionMetadata => {
  const openchamber: BtwMetadata = { kind: 'btw', originalSessionID };
  if (boundaryMessageID) openchamber.btwBoundaryMessageID = boundaryMessageID;
  return { ...metadata, openchamber };
};

export const withoutBtwSessionMarker = (metadata: SessionMetadata): SessionMetadata => {
  if (metadata.openchamber?.kind !== 'btw') return metadata;
  const { kind: _kind, originalSessionID: _originalSessionID, btwBoundaryMessageID: _boundary, ...rest } = metadata.openchamber;
  return { ...metadata, openchamber: { ...rest, btwPromoted: true } };
};

export const withoutBtwSessionLink = (metadata: SessionMetadata, btwSessionID: string): SessionMetadata => {
  if (metadata.openchamber?.btwSessionID !== btwSessionID) return metadata;
  const { btwSessionID: _btwSessionID, ...rest } = metadata.openchamber;
  if (Object.keys(rest).length > 0) return { ...metadata, openchamber: rest };
  const { openchamber: _openchamber, ...without } = metadata;
  return without;
};
