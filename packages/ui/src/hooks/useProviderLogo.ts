import { useState, useCallback, useEffect } from 'react';
import { providerLogoUploadSupported } from '@/lib/customProviderLogos';
import { guestProviderLogoOf } from '@/lib/guests/provider-logos';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';

type LogoSource = 'local' | 'remote' | 'none';

interface UseProviderLogoReturn {
    src: string | null;
    onError: () => void;
    hasLogo: boolean;
    /** `src` is a logo the app ships, so drawing it takes no request. */
    isBundled: boolean;
}

// Vite rewrites `import.meta.glob` at build time into the matching modules. A runtime without
// that transform (the bun test runner) throws on the call instead, so keep it failable and let
// the hook fall back to the remote logo URL it already supports.
const loadLocalLogoModules = (): Record<string, string> => {
    try {
        return import.meta.glob<string>('../assets/provider-logos/*.svg', {
            eager: true,
            import: 'default',
        });
    } catch {
        return {};
    }
};

const localLogoModules = loadLocalLogoModules();

const LOCAL_PROVIDER_LOGO_MAP = new Map<string, string>();
const PRELOADED_LOGO_SRCS = new Set<string>();

const LOGO_ALIAS = new Map<string, string>([
    ['codex', 'openai'],
    ['chatgpt', 'openai'],
    ['claude', 'anthropic'],
    ['claude-agent', 'claude-code'],
    ['cline-pass', 'cline'],
    ['gemini', 'google'],
    ['evroc-ai', 'evroc'],
    ['evrocai', 'evroc'],
    ['ollama-cloud', 'ollama'],
    ['wafer-ai', 'wafer.ai'],
    ['wafer', 'wafer.ai'],
    ['copilot', 'github-copilot'],
]);

// Whether the models.dev catalog carries this provider, read from the catalog
// the app already holds (its metadata map is keyed `<providerId>/<modelId>`).
// A provider outside it — the user's own `models.yml` entry such as
// `CLIProxyAPI` — has no logo to fetch: probing `models.dev/logos/<id>.svg` for
// it was a failed image request in every session that used one
// (`net::ERR_CONNECTION_CLOSED`).
const inModelsDevCatalog = (providerId: string): boolean => {
    const prefix = `${providerId}/`;
    for (const key of useConfigStore.getState().modelsMetadata.keys()) {
        if (key.startsWith(prefix)) return true;
    }
    return false;
};

// A bundled logo proves the id is a provider the app knows even before the
// catalog arrives; an alias names one the app draws already.
const isKnownProviderLogo = (providerId: string, candidates: readonly string[]): boolean =>
    LOGO_ALIAS.has(providerId)
    || candidates.some((candidate) => LOCAL_PROVIDER_LOGO_MAP.has(candidate))
    || inModelsDevCatalog(providerId);

const normalizeProviderId = (providerId: string | null | undefined) => {
    return (providerId ?? '')
        .toLowerCase()
        .trim()
        .replace(/^models\./, '')
        .replace(/^provider\./, '')
        .replace(/\s+/g, '-');
};

const buildLogoCandidates = (providerId: string | null | undefined) => {
    const normalized = normalizeProviderId(providerId);
    if (!normalized) {
        return [] as string[];
    }

    const compact = normalized.replace(/[^a-z0-9_\-./:]/g, '');
    const primary = compact.split(/[/:]/)[0] || compact;
    const prefixAlias = compact.startsWith('exe-') ? 'exe-dev' : undefined;
    const candidates = [prefixAlias, LOGO_ALIAS.get(compact), LOGO_ALIAS.get(primary), compact, primary]
        .filter((value): value is string => Boolean(value && value.length > 0));

    return [...new Set(candidates)];
};

/**
 * The IDs an extension's logo can be named under, most specific first: the
 * provider's own, then the ones the app draws it with. A logo for `anthropic`
 * reaches the `claude` usage card, which draws the same bundled logo.
 */
export const providerLogoIds = (providerId: string): string[] => [providerId, ...buildLogoCandidates(providerId)];

/**
 * The remote logo URL for a provider the catalog knows, or null. This is the
 * only place a `models.dev` address is built: an id absent from the known
 * catalog gets the bundled fallback mark instead of a request that cannot
 * succeed.
 */
const remoteProviderLogoSrc = (providerId: string | null | undefined, candidates: readonly string[]): string | null => {
    const remoteResolvedId = candidates[0] ?? null;
    if (!remoteResolvedId) return null;
    const normalized = normalizeProviderId(providerId);
    return isKnownProviderLogo(normalized, candidates) ? `https://models.dev/logos/${remoteResolvedId}.svg` : null;
};

const resolveProviderLogoSrc = (providerId: string | null | undefined): string | null => {
    const candidates = buildLogoCandidates(providerId);
    const localResolvedId = candidates.find((candidate) => LOCAL_PROVIDER_LOGO_MAP.has(candidate)) ?? null;
    const localLogoSrc = localResolvedId ? LOCAL_PROVIDER_LOGO_MAP.get(localResolvedId) ?? null : null;
    if (localLogoSrc) {
        return localLogoSrc;
    }

    return remoteProviderLogoSrc(providerId, candidates);
};

const preloadProviderLogo = (providerId: string | null | undefined): void => {
    if (typeof Image === 'undefined') return;
    // An uploaded logo replaces this one and comes from the OpenChamber server when drawn.
    if (providerId && providerLogoUploadSupported() && useUIStore.getState().customProviderLogos[providerId]) return;
    // So does an extension's.
    if (providerId && guestProviderLogoOf(providerLogoIds(providerId))) return;
    const src = resolveProviderLogoSrc(providerId);
    if (!src || PRELOADED_LOGO_SRCS.has(src)) return;

    PRELOADED_LOGO_SRCS.add(src);
    const image = new Image();
    image.decoding = 'async';
    image.onerror = () => {
        PRELOADED_LOGO_SRCS.delete(src);
    };
    image.src = src;
    void image.decode?.().catch(() => undefined);
};

export const preloadProviderLogos = (providerIds: readonly (string | null | undefined)[]): void => {
    for (const providerId of providerIds) {
        preloadProviderLogo(providerId);
    }
};

for (const [path, url] of Object.entries(localLogoModules)) {
    const match = path.match(/provider-logos\/([^/]+)\.svg$/i);
    if (match?.[1] && url) {
        LOCAL_PROVIDER_LOGO_MAP.set(match[1].toLowerCase(), url);
    }
}

export function useProviderLogo(providerId: string | null | undefined): UseProviderLogoReturn {
    const candidates = buildLogoCandidates(providerId);
    const localResolvedId = candidates.find((candidate) => LOCAL_PROVIDER_LOGO_MAP.has(candidate)) ?? null;
    const remoteLogoSrc = remoteProviderLogoSrc(providerId, candidates);
    const hasLocalLogo = Boolean(localResolvedId);
    const localLogoSrc = localResolvedId ? LOCAL_PROVIDER_LOGO_MAP.get(localResolvedId) ?? null : null;

    const [source, setSource] = useState<LogoSource>(hasLocalLogo ? 'local' : 'remote');

    useEffect(() => {
        setSource(hasLocalLogo ? 'local' : 'remote');
    }, [hasLocalLogo, localResolvedId, remoteLogoSrc]);

    const handleError = useCallback(() => {
        setSource((current) => (current === 'local' && hasLocalLogo ? 'remote' : 'none'));
    }, [hasLocalLogo]);

    if (!localResolvedId && !remoteLogoSrc) {
        return { src: null, onError: handleError, hasLogo: false, isBundled: false };
    }

    if (source === 'local' && localLogoSrc) {
        return {
            src: localLogoSrc,
            onError: handleError,
            hasLogo: true,
            isBundled: true,
        };
    }

    if (source === 'remote' && remoteLogoSrc) {
        return {
            src: remoteLogoSrc,
            onError: handleError,
            hasLogo: true,
            isBundled: false,
        };
    }

    return { src: null, onError: handleError, hasLogo: false, isBundled: false };
}
