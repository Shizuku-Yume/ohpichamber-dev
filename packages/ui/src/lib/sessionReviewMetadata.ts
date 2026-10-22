import type { Session, SessionMetadata } from '@openchamber/agent-contract';

export type SessionMetadataRecord = SessionMetadata;

type OpenChamberMetadata = NonNullable<SessionMetadata['openchamber']>;

const getOpenChamberMetadata = (metadata: SessionMetadataRecord): OpenChamberMetadata =>
  metadata.openchamber ?? {};

export const getSessionMetadata = (session: Session | null | undefined): SessionMetadataRecord =>
  session?.metadata ?? {};

export const getReviewSessionID = (session: Session | null | undefined): string | null => {
  const value = getOpenChamberMetadata(getSessionMetadata(session)).reviewSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const getOriginalSessionID = (session: Session | null | undefined): string | null => {
  const value = getOpenChamberMetadata(getSessionMetadata(session)).originalSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const isReviewSession = (session: Session | null | undefined): boolean =>
  getOpenChamberMetadata(getSessionMetadata(session)).kind === 'review' && Boolean(getOriginalSessionID(session));

export const withReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => ({
  ...metadata,
  openchamber: { ...getOpenChamberMetadata(metadata), reviewSessionID },
});

export const withReviewSessionMarker = (
  metadata: SessionMetadataRecord,
  originalSessionID: string,
): SessionMetadataRecord => ({
  ...metadata,
  openchamber: { ...getOpenChamberMetadata(metadata), kind: 'review', originalSessionID },
});

export const withoutReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getOpenChamberMetadata(metadata);
  if (current.reviewSessionID !== reviewSessionID) return metadata;
  const { reviewSessionID: _removed, ...restOpenChamber } = current;
  if (Object.keys(restOpenChamber).length > 0) return { ...metadata, openchamber: restOpenChamber };
  const { openchamber: _openchamber, ...rest } = metadata;
  return rest;
};
