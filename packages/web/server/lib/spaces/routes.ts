import { z } from 'zod';

import { SpaceError } from './errors.js';
import { isSpaceId } from './labels.js';
import { isSpacesReleased, requireSpacesReleased } from './release.js';
import type { SpacePlace } from './places/registry.js';
import type { SpaceArchive } from './space-archive.js';
import type { Application, Request, Response } from '../shared/http-contracts.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

export const SPACES_ROUTE = '/api/openchamber/spaces';

const STATUS_BY_CODE = new Map<string, number>([
  ['space_not_found', 404],
  ['place_not_found', 404],
  ['project_not_registered', 400],
  ['invalid_space_name', 400],
  ['invalid_project_directory', 400],
  ['invalid_snapshot_mode', 400],
  ['invalid_network', 400],
  ['invalid_apply_request', 400],
  ['invalid_branch_name', 400],
  ['invalid_space_id', 400],
  ['invalid_request_body', 400],
  ['invalid_grant_request', 400],
  ['provider_not_supported', 400],
  ['invalid_domain', 400],
  ['invalid_idle_stop', 400],
  ['network_is_open', 409],
  ['too_many_domains', 409],
  ['secret_source_missing', 409],
  ['space_record_unreadable', 409],
  ['space_preparing', 409],
  ['space_creation_failed', 409],
  ['space_busy', 409],
  ['image_pulling', 409],
  ['isolated_spaces_off', 404],
  ['isolated_spaces_unreleased', 409],
  ['space_not_running', 409],
  ['branch_exists', 409],
  ['changes_do_not_apply', 409],
  ['changes_route_closed', 409],
  ['changes_partly_applied', 409],
  ['changes_undecided', 409],
  ['changes_too_large', 409],
  ['changes_blocked_by_link', 409],
  ['name_not_allowed_here', 409],
  ['case_only_rename', 409],
  ['patch_not_possible', 409],
  ['nothing_to_apply', 409],
  ['place_cannot_restrict_network', 409],
  ['space_remove_incomplete', 502],
  ['gatekeeper_missing', 409],
  ['invalid_setup_commands', 400],
  ['space_setup_running', 409],
  ['chats_not_saved', 409],
]);

const errorMessageSchema = z.object({
  message: z.string().optional(),
});

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema.optional()),
  ]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema.optional());

export interface SpaceFailureResponse {
  code: string;
  message: string;
  details: JsonValue | object | null;
}

export interface SpaceFailureResponder {
  status: (code: number) => SpaceFailureResponder;
  json: (body: SpaceFailureResponse) => void;
}

export const answerFailure = (res: SpaceFailureResponder, error: Error): void => {
  if (error instanceof SpaceError) {
    res.status(STATUS_BY_CODE.get(error.code) ?? 502).json({ code: error.code, message: error.message, details: error.details ?? null });
    return;
  }
  res.status(500).json({ code: 'space_journey_failed', message: error?.message ?? String(error), details: null });
};

const switchBodySchema = z.object({ enabled: z.boolean() });

export interface SwitchSpaceSummary {
  id: string;
  name: string;
  state: string;
}

export interface SwitchStopOutcome {
  stopped: Array<{ id: string; name: string }>;
  stillRunning: Array<{ id: string; name: string; code: string; message: string; details: JsonValue | object | null }>;
  unknown?: { code: string; message: string; details: JsonValue | object | null } | undefined;
}

export interface SwitchManagedHost {
  journey: {
    listSpaces: () => Promise<SwitchSpaceSummary[]>;
    stopAllSpaces: () => Promise<SwitchStopOutcome>;
    reopen: () => void;
  };
  close: () => void;
}

export interface SwitchControllerDependencies<THost extends SwitchManagedHost> {
  getHost: () => THost | null;
  setHost: (host: THost | null) => void;
  buildHost: () => THost;
  startHost: (host: THost) => void;
  persist: (enabled: boolean) => Promise<void>;
  isReleased?: (() => boolean) | undefined;
  requireReleased?: (() => void) | undefined;
}

export interface ReadSwitchResult {
  enabled: boolean;
  spaces: SwitchSpaceSummary[] | null;
  failure?: { code: string; message: string } | undefined;
}

export interface SetSwitchResult extends SwitchStopOutcome {
  enabled: boolean;
}

export function createSwitchController<THost extends SwitchManagedHost>({
  getHost,
  setHost,
  buildHost,
  startHost,
  persist,
  isReleased = isSpacesReleased,
  requireReleased = requireSpacesReleased,
}: SwitchControllerDependencies<THost>) {
  let turning = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const next = turning.then(work, work);
    turning = next.then(() => undefined, () => undefined);
    return next;
  };

  const readSwitch = async (): Promise<ReadSwitchResult> => {
    if (!isReleased()) return { enabled: false, spaces: [] };
    const host = getHost();
    if (!host) return { enabled: false, spaces: [] };
    try {
      const spaces = await host.journey.listSpaces();
      return { enabled: true, spaces: spaces.map(({ id, name, state }) => ({ id, name, state })) };
    } catch (error) {
      const message = error instanceof Error ? error.message : (errorMessageSchema.safeParse(error).data?.message ?? String(error));
      return { enabled: true, spaces: null, failure: { code: error instanceof SpaceError ? error.code : 'space_journey_failed', message } };
    }
  };

  const setSwitch = (enabled: boolean): Promise<SetSwitchResult> => inTurn(async () => {
    if (enabled) requireReleased();
    const host = getHost();
    if (enabled === Boolean(host)) return { enabled, stopped: [], stillRunning: [] };
    if (!enabled) {
      if (!host) return { enabled: false, stopped: [], stillRunning: [] };
      const outcome = await host.journey.stopAllSpaces();
      try {
        await persist(false);
      } catch (error) {
        host.journey.reopen();
        throw error;
      }
      setHost(null);
      host.close();
      return { enabled: false, ...outcome };
    }
    await persist(true);
    const made = buildHost();
    startHost(made);
    setHost(made);
    return { enabled: true, stopped: [], stillRunning: [] };
  });

  return { readSwitch, setSwitch };
}

export type SpaceRoutePayload = JsonValue | object;

export interface SpaceRoutesJourney {
  readIdleStopSetting: () => Promise<SpaceRoutePayload>;
  changeIdleStop: (request: JsonObject) => Promise<SpaceRoutePayload>;
  readDisk: (placeId: string) => Promise<SpaceRoutePayload>;
  cleanUpDisk: (placeId: string) => Promise<SpaceRoutePayload>;
  pullImage: (placeId: string) => Promise<SpaceRoutePayload>;
  listSpaces: (options: { access: boolean }) => Promise<SpaceRoutePayload>;
  createSpace: (request: JsonObject) => Promise<SpaceRoutePayload>;
  startSpace: (spaceId: string) => Promise<SpaceRoutePayload>;
  stopSpace: (spaceId: string) => Promise<SpaceRoutePayload>;
  restartSpace: (spaceId: string) => Promise<SpaceRoutePayload>;
  removeSpace: (spaceId: string, options: { allowUnsaved: boolean }) => Promise<SpaceRoutePayload>;
  grantAccess: (spaceId: string, request: JsonObject) => Promise<SpaceRoutePayload>;
  openDomain: (spaceId: string, request: JsonObject) => Promise<SpaceRoutePayload>;
  runSetup: (spaceId: string, request: JsonObject) => Promise<SpaceRoutePayload>;
  readSetup: (spaceId: string) => Promise<SpaceRoutePayload>;
  readJournal: (spaceId: string) => Promise<SpaceRoutePayload>;
  previewApply: (spaceId: string) => Promise<SpaceRoutePayload>;
  applySpace: (spaceId: string, request: JsonObject) => Promise<SpaceRoutePayload>;
}

export interface RegisterSpaceRoutesDependencies {
  getJourney: () => SpaceRoutesJourney | null;
  getPlaces?: (() => readonly SpacePlace[]) | undefined;
  readSwitch: () => Promise<ReadSwitchResult>;
  setSwitch: (enabled: boolean) => Promise<SetSwitchResult>;
  getArchive?: (() => Pick<SpaceArchive, 'listArchives'> | null) | undefined;
}
export function registerSpaceRoutes(
  app: Application,
  {
    getJourney,
    getPlaces = () => [],
    readSwitch,
    setSwitch,
    getArchive = () => null,
  }: RegisterSpaceRoutesDependencies,
): void {
  const withJourney = (handler: (journey: SpaceRoutesJourney, req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      const journey = getJourney();
      if (!journey) {
        res.status(404).json({ code: 'isolated_spaces_off', message: 'Isolated spaces are turned off.', details: null });
        return;
      }
      try {
        await handler(journey, req, res);
      } catch (error) {
        const message = errorMessageSchema.safeParse(error).data?.message ?? String(error);
        answerFailure(res, error instanceof Error ? error : new Error(message));
      }
    };

  const spaceIdOf = (req: Request): string => {
    const id = String(req.params.id ?? '');
    if (!isSpaceId(id)) throw new SpaceError('space_not_found', `There is no space ${id}`);
    return id;
  };

  const requireBody = (req: Request): JsonObject => {
    const parsed = jsonObjectSchema.safeParse(req.body);
    if (!parsed.success) throw new SpaceError('invalid_request_body', 'The body is a JSON object.');
    return parsed.data;
  };

  app.get(`${SPACES_ROUTE}/switch`, async (_req, res) => {
    try {
      res.json(await readSwitch());
    } catch (error) {
      const message = errorMessageSchema.safeParse(error).data?.message ?? String(error);
      answerFailure(res, error instanceof Error ? error : new Error(message));
    }
  });
  app.put(`${SPACES_ROUTE}/switch`, async (req, res) => {
    try {
      const body = switchBodySchema.safeParse(req.body);
      if (!body.success) throw new SpaceError('invalid_request_body', 'The switch takes `enabled`, true or false.');
      res.json(await setSwitch(body.data.enabled));
    } catch (error) {
      const message = errorMessageSchema.safeParse(error).data?.message ?? String(error);
      answerFailure(res, error instanceof Error ? error : new Error(message));
    }
  });

  app.get(`${SPACES_ROUTE}/archives`, (_req, res) => {
    res.json({ archives: getArchive()?.listArchives() ?? [] });
  });

  app.get(`${SPACES_ROUTE}/idle-stop`, withJourney(async (journey, _req, res) => {
    res.json(await journey.readIdleStopSetting());
  }));
  app.put(`${SPACES_ROUTE}/idle-stop`, withJourney(async (journey, req, res) => {
    res.json(await journey.changeIdleStop(requireBody(req)));
  }));

  app.get(`${SPACES_ROUTE}/places`, withJourney(async (_journey, _req, res) => {
    const places = await Promise.all(getPlaces().map(async (place) => ({ id: place.id, ...(await place.check()) })));
    res.json({ places });
  }));

  app.get(`${SPACES_ROUTE}/places/:placeId/disk`, withJourney(async (journey, req, res) => {
    res.json(await journey.readDisk(String(req.params.placeId ?? '')));
  }));
  app.post(`${SPACES_ROUTE}/places/:placeId/clean-up`, withJourney(async (journey, req, res) => {
    res.json(await journey.cleanUpDisk(String(req.params.placeId ?? '')));
  }));
  app.post(`${SPACES_ROUTE}/places/:placeId/image`, withJourney(async (journey, req, res) => {
    res.status(202).json(await journey.pullImage(String(req.params.placeId ?? '')));
  }));

  app.get(SPACES_ROUTE, withJourney(async (journey, _req, res) => {
    res.json({ spaces: await journey.listSpaces({ access: true }) });
  }));

  app.post(SPACES_ROUTE, withJourney(async (journey, req, res) => {
    res.status(202).json(await journey.createSpace(requireBody(req)));
  }));

  app.post(`${SPACES_ROUTE}/:id/start`, withJourney(async (journey, req, res) => {
    res.json(await journey.startSpace(spaceIdOf(req)));
  }));

  app.post(`${SPACES_ROUTE}/:id/stop`, withJourney(async (journey, req, res) => {
    res.json(await journey.stopSpace(spaceIdOf(req)));
  }));

  app.post(`${SPACES_ROUTE}/:id/restart`, withJourney(async (journey, req, res) => {
    res.json(await journey.restartSpace(spaceIdOf(req)));
  }));

  app.delete(`${SPACES_ROUTE}/:id`, withJourney(async (journey, req, res) => {
    res.json(await journey.removeSpace(spaceIdOf(req), { allowUnsaved: req.query?.unsavedChats === 'delete' }));
  }));

  app.post(`${SPACES_ROUTE}/:id/grants`, withJourney(async (journey, req, res) => {
    res.json(await journey.grantAccess(spaceIdOf(req), requireBody(req)));
  }));

  app.post(`${SPACES_ROUTE}/:id/network/domains`, withJourney(async (journey, req, res) => {
    res.json(await journey.openDomain(spaceIdOf(req), requireBody(req)));
  }));

  app.post(`${SPACES_ROUTE}/:id/setup`, withJourney(async (journey, req, res) => {
    res.json(await journey.runSetup(spaceIdOf(req), requireBody(req)));
  }));

  app.get(`${SPACES_ROUTE}/:id/setup`, withJourney(async (journey, req, res) => {
    res.json(await journey.readSetup(spaceIdOf(req)));
  }));

  app.get(`${SPACES_ROUTE}/:id/journal`, withJourney(async (journey, req, res) => {
    res.json(await journey.readJournal(spaceIdOf(req)));
  }));

  app.get(`${SPACES_ROUTE}/:id/apply`, withJourney(async (journey, req, res) => {
    res.json(await journey.previewApply(spaceIdOf(req)));
  }));

  app.post(`${SPACES_ROUTE}/:id/apply`, withJourney(async (journey, req, res) => {
    res.json(await journey.applySpace(spaceIdOf(req), requireBody(req)));
  }));
}
