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
    isBundled: boolean;
}

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
const catalogCarriesProvider = (modelsMetadata: ReadonlyMap<string, unknown>, providerId: string): boolean => {
    const prefix = `${providerId}/`;
    for (const key of modelsMetadata.keys()) {
        if (key.startsWith(prefix)) return true;
    }
    return false;
};

// A bundled logo proves the id is a provider the app knows even before the
// catalog arrives; an alias names one the app draws already. `catalogCarries`
// is the lazily loaded catalog's evidence, supplied by each caller (the hook
// subscribes to it; the preloader reads it once).
const isKnownProviderLogo = (
    providerId: string,
    candidates: readonly string[],
    catalogCarries: boolean,
): boolean =>
    LOGO_ALIAS.has(providerId)
    || candidates.some((candidate) => LOCAL_PROVIDER_LOGO_MAP.has(candidate))
    || catalogCarries;

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

export const providerLogoIds = (providerId: string): string[] => [providerId, ...buildLogoCandidates(providerId)];

/**
 * The remote logo URL for a provider the catalog knows, or null. This is the
 * only place a `models.dev` address is built: an id absent from the known
 * catalog gets the bundled fallback mark instead of a request that cannot
 * succeed.
 */
const remoteProviderLogoSrc = (
    providerId: string | null | undefined,
    candidates: readonly string[],
    catalogCarries: boolean,
): string | null => {
    const remoteResolvedId = candidates[0] ?? null;
    if (!remoteResolvedId) return null;
    return isKnownProviderLogo(normalizeProviderId(providerId), candidates, catalogCarries)
        ? `https://models.dev/logos/${remoteResolvedId}.svg`
        : null;
};

const resolveProviderLogoSrc = (providerId: string | null | undefined): string | null => {
    const candidates = buildLogoCandidates(providerId);
    const localResolvedId = candidates.find((candidate) => LOCAL_PROVIDER_LOGO_MAP.has(candidate)) ?? null;
    const localLogoSrc = localResolvedId ? LOCAL_PROVIDER_LOGO_MAP.get(localResolvedId) ?? null : null;
    if (localLogoSrc) {
        return localLogoSrc;
    }

    return remoteProviderLogoSrc(
        providerId,
        candidates,
        catalogCarriesProvider(useConfigStore.getState().modelsMetadata, normalizeProviderId(providerId)),
    );
};

const preloadProviderLogo = (providerId: string | null | undefined): void => {
    if (typeof Image === 'undefined') return;
    if (providerId && providerLogoUploadSupported() && useUIStore.getState().customProviderLogos[providerId]) return;
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
    // The models.dev catalog arrives lazily (the store loads it when idle), and
    // it is the only evidence a remote logo can succeed for a provider the app
    // does not ship. Subscribe to that evidence as a boolean so the logo appears
    // when it lands, without re-rendering on an unrelated store change.
    const catalogCarriesThisProvider = useConfigStore(
        useCallback(
            (state) => catalogCarriesProvider(state.modelsMetadata, normalizeProviderId(providerId)),
            [providerId],
        ),
    );
    const candidates = buildLogoCandidates(providerId);
    const localResolvedId = candidates.find((candidate) => LOCAL_PROVIDER_LOGO_MAP.has(candidate)) ?? null;
    const remoteLogoSrc = remoteProviderLogoSrc(providerId, candidates, catalogCarriesThisProvider);
    const hasLocalLogo = Boolean(localResolvedId);
    const localLogoSrc = localResolvedId ? LOCAL_PROVIDER_LOGO_MAP.get(localResolvedId) ?? null : null;

    const [source, setSource] = useState<LogoSource>(hasLocalLogo ? 'local' : 'remote');

    useEffect(() => {
        setSource(hasLocalLogo ? 'local' : 'remote');
    }, [hasLocalLogo, localResolvedId, remoteLogoSrc, catalogCarriesThisProvider]);

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
