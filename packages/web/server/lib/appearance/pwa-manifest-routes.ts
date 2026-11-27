import { z } from 'zod';
import type { Application, Request, Response } from '../shared/http-contracts.js';
import type { JsonValue } from '../shared/json-values.js';
import type { ProjectDirectoryRequest, ProjectDirectoryResolution } from '../projects/project-directory-runtime.js';

export interface PwaSettings { pwaAppName?: JsonValue; pwaOrientation?: JsonValue; }
export interface PwaManifestDependencies {
  resolveProjectDirectory: (request: ProjectDirectoryRequest) => Promise<ProjectDirectoryResolution>;
  listSessions: (directory: string | null) => Promise<{ items?: { sessionId?: string | undefined; title?: string | undefined; updatedAt?: number | undefined }[] }>;
  readSettingsFromDiskMigrated: () => Promise<PwaSettings>;
  normalizePwaAppName: (value: JsonValue | undefined, fallback: string) => string;
  normalizePwaOrientation: (value: JsonValue | undefined, fallback: string) => string;
  isRequestAuthorized: (req: Request, res: Response) => Promise<boolean>;
}
interface PwaManifest {
  name: string;
  short_name: string;
  description: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  background_color: string;
  theme_color: string;
  orientation?: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  shortcuts: PwaShortcut[];
  categories: string[];
  lang: string;
}
interface PwaShortcut { name: string; short_name: string; description: string; url: string; icons: { src: string; sizes: string; type: string }[]; }

const DEFAULT_PWA_APP_NAME = 'OhPiChamber';
const mapPwaOrientationToManifest = (value: string) => {
  if (value === 'portrait') {
    return 'portrait-primary';
  }
  if (value === 'landscape') {
    return 'landscape-primary';
  }
  return undefined;
};

export const registerPwaManifestRoute = (app: Application, dependencies: PwaManifestDependencies) => {
  const {
    resolveProjectDirectory,
    listSessions,
    readSettingsFromDiskMigrated,
    normalizePwaAppName,
    normalizePwaOrientation,
    isRequestAuthorized,
  } = dependencies;

  if (!listSessions) {
    throw new Error('PWA manifest route requires a canonical session list reader');
  }

  const recentPwaSessionsCache = new Map<string, { at: number; data: PwaShortcut[] }>();

  const getRecentPwaSessionShortcuts = async () => {
    const now = Date.now();
    const resolvedDirectoryResult = await resolveProjectDirectory({}).catch(() => ({ directory: null }));
    const preferredDirectory = resolvedDirectoryResult?.directory ?? null;
    const cacheKey = preferredDirectory ? `dir:${preferredDirectory}` : 'global';
    const cached = recentPwaSessionsCache.get(cacheKey);
    if (cached && now - cached.at < 5000) {
      return cached.data;
    }

    const normalizeShortcutTitle = (value: JsonValue | undefined, fallback: string) => normalizePwaAppName(value, fallback).slice(0, 48);

    try {
      const listed = await listSessions(preferredDirectory);
      const payload = Array.isArray(listed?.items) ? listed.items : [];
      const seen = new Set();
      const rows: { id: string; title: string; updatedAt: number }[] = [];

      for (const item of payload) {
        const id = item?.sessionId?.trim().slice(0, 160) ?? '';
        if (!id || seen.has(id)) {
          continue;
        }

        seen.add(id);
        rows.push({
          id,
          title: normalizeShortcutTitle(item.title, `Session ${rows.length + 1}`),
          updatedAt: item.updatedAt !== undefined && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
        });
      }

      rows.sort((a, b) => b.updatedAt - a.updatedAt);

      const shortcuts = rows.slice(0, 3).map((session) => ({
        name: session.title,
        short_name: session.title.length > 32 ? session.title.slice(0, 32) : session.title,
        description: 'Open recent session',
        url: `/?session=${encodeURIComponent(session.id)}`,
        icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
      }));

      recentPwaSessionsCache.set(cacheKey, { at: now, data: shortcuts });
      return shortcuts;
    } catch {
      recentPwaSessionsCache.set(cacheKey, { at: now, data: [] });
      return [];
    }
  };

  const manifestQuerySchema = z.object({
    pwa_name: z.string().optional(),
    app_name: z.string().optional(),
    appName: z.string().optional(),
    orientation: z.string().optional(),
  });

  app.get('/manifest.webmanifest', async (req, res) => {
    const parsedQuery = manifestQuerySchema.safeParse(req.query);
    const query = parsedQuery.success ? parsedQuery.data : {};
    const hasQueryOverride =
      query.pwa_name !== undefined
      || query.app_name !== undefined
      || query.appName !== undefined;

    const queryValueRaw = query.pwa_name ?? query.app_name ?? query.appName ?? '';

    const queryOverrideName = normalizePwaAppName(queryValueRaw, '');
    const hasOrientationOverride = query.orientation !== undefined;
    const queryOverrideOrientation = normalizePwaOrientation(query.orientation, 'system');
    let storedName = '';
    let storedOrientation = 'system';
    try {
      const settings = await readSettingsFromDiskMigrated();
      storedName = normalizePwaAppName(settings?.pwaAppName, '');
      storedOrientation = normalizePwaOrientation(settings?.pwaOrientation, 'system');
    } catch {
      storedName = '';
      storedOrientation = 'system';
    }

    const appName = hasQueryOverride
      ? (queryOverrideName || DEFAULT_PWA_APP_NAME)
      : (storedName || DEFAULT_PWA_APP_NAME);
    const manifestOrientation = mapPwaOrientationToManifest(
      hasOrientationOverride ? queryOverrideOrientation : storedOrientation
    );

    const shortName = appName.length > 30 ? appName.slice(0, 30) : appName;
    const recentSessionShortcuts = await isRequestAuthorized(req, res).catch(() => false)
      ? await getRecentPwaSessionShortcuts()
      : [];

    const manifest: PwaManifest = {
      name: appName,
      short_name: shortName,
      description: 'Web interface for the OhPiChamber native agent',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['window-controls-overlay'],
      background_color: '#151313',
      theme_color: '#edb449',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: '/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        { src: '/apple-touch-icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
        { src: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { src: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      ],
      shortcuts: [
        {
          name: 'Appearance Settings',
          short_name: 'Settings',
          description: 'Open appearance settings',
          url: '/?settings=appearance',
          icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
        },
        ...recentSessionShortcuts,
      ],
      categories: ['developer', 'tools', 'productivity'],
      lang: 'en',
    };
    if (manifestOrientation) {
      manifest.orientation = manifestOrientation;
    }

    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.type('application/manifest+json');
    res.send(JSON.stringify(manifest));
  });
};
