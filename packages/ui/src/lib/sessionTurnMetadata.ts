import { z } from 'zod';
import type { Session } from '@openchamber/agent-contract';

<<<<<<< HEAD
// How long the last turn ran, recorded by the server under
// `session.metadata.openchamber.turn` when the turn ends
// (`packages/web/server/lib/openchamber-sessions/turn-duration.js`). It lives
// on the session record, so it survives restarts and reaches every device.
||||||| bc50ba56aa
// How long the last turn ran, recorded by the server under
// `session.metadata.openchamber.turn` when the turn ends
// (`packages/web/server/lib/openchamber-sessions/turn-duration.js`). It lives
// on the OpenCode record, so it survives restarts and reaches every device.
=======
>>>>>>> upstream/main
const turnMetadataSchema = z.object({
 openchamber: z.object({
  turn: z.object({
   endedAt: z.number(),
   durationMs: z.number().nonnegative(),
  }),
 }),
});

const workbenchSchema = z.object({
 openchamber: z.object({
  workbench: z.object({
   lastIdleAt: z.number().optional(),
  }).optional(),
 }).optional(),
});

const SAME_TURN_TOLERANCE_MS = 1_000;

const durationByRecord = new WeakMap<Session, { durationMs: number | undefined }>();

const sessionTimeSchema = z.object({ idle: z.number().optional() });

const readIdleTime = (session: Session): number | undefined => {
 const workbenchIdle = workbenchSchema.safeParse(session.metadata).data?.openchamber?.workbench?.lastIdleAt;
 if (typeof workbenchIdle === 'number' && Number.isFinite(workbenchIdle)) {
  return workbenchIdle;
 }
 if ('time' in session && session.time) {
  const parsed = sessionTimeSchema.safeParse(session.time);
  if (parsed.success && typeof parsed.data.idle === 'number') {
   return parsed.data.idle;
  }
 }
 return session.updatedAt;
};

const readRecordedTurnDurationMs = (session: Session): number | undefined => {
 const idle = readIdleTime(session);
 if (idle === undefined) return undefined;
 const parsed = turnMetadataSchema.safeParse(session.metadata);
 if (!parsed.success) return undefined;
 const { endedAt, durationMs } = parsed.data.openchamber.turn;
 return Math.abs(idle - endedAt) <= SAME_TURN_TOLERANCE_MS ? durationMs : undefined;
};

export function getRecordedTurnDurationMs(session: Session | undefined): number | undefined {
 if (!session) return undefined;
 const cached = durationByRecord.get(session);
 if (cached) return cached.durationMs;
 const durationMs = readRecordedTurnDurationMs(session);
 durationByRecord.set(session, { durationMs });
 return durationMs;
}
