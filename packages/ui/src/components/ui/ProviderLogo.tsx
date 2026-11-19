import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useProviderLogo } from '@/hooks/useProviderLogo';
import { cn } from '@/lib/utils';
import { getProviderLogoFallbackIcon } from './providerLogoFallback';
import { useUIStore } from '@/stores/useUIStore';
import { customProviderIconName } from '@/lib/customProviderIcons';

interface ProviderLogoProps {
    providerId: string;
    alt?: string;
    className?: string;
    onError?: () => void;
<<<<<<< HEAD
    /** Show the provider's own logo even when the user picked an icon for it. */
||||||| bc50ba56aa
    /** Show the provider's own logo even when the user uploaded a logo or picked an icon for it. */
=======
>>>>>>> upstream/main
    ignoreCustomIcon?: boolean;
    fallback?: React.ReactNode;
    tint?: boolean;
}

<<<<<<< HEAD
||||||| bc50ba56aa
const NO_URLS: ReadonlySet<string> = new Set();

/**
 * A provider's mark, first match wins: the logo the user uploaded, the icon
 * they picked, an active extension's logo, the bundled logo, the models.dev
 * logo, the generic fallback.
 */
=======
const NO_URLS: ReadonlySet<string> = new Set();

>>>>>>> upstream/main
export const ProviderLogo: React.FC<ProviderLogoProps> = ({
    providerId,
    alt,
    className,
    onError: externalOnError,
    ignoreCustomIcon = false,
    fallback,
    tint = false,
}) => {
    const { src, onError: handleInternalError, hasLogo } = useProviderLogo(providerId);
    const customIcon = useUIStore((state) => state.customProviderIcons[providerId]);
<<<<<<< HEAD
||||||| bc50ba56aa
    const storedLogo = useUIStore((state) => state.customProviderLogos[providerId]);
    const wantsUploadedLogo = Boolean(storedLogo) && !ignoreCustomIcon && providerLogoUploadSupported();
    const themeVariant = useOptionalThemeSystem()?.currentTheme.metadata.variant === 'light' ? 'light' : 'dark';
    const uploadedLogo = useUploadedProviderLogoUrl(providerId, wantsUploadedLogo ? storedLogo : undefined, themeVariant);
    // Images the browser fetched but cannot draw (an SVG without its namespace).
    const [undrawableUrls, setUndrawableUrls] = React.useState(NO_URLS);
    const standsIn = (image: RuntimeObjectUrl) => !image.failed && !(image.url && undrawableUrls.has(image.url));
    const showsUpload = wantsUploadedLogo && standsIn(uploadedLogo);
    const chosenIcon = ignoreCustomIcon ? undefined : customIcon;
    const guestLogo = useGuestProviderLogo(providerLogoIds(providerId));
    const wantsGuestLogo = guestLogo !== null && !showsUpload && !chosenIcon;
    const guestLogoUrl = useGuestProviderLogoUrl(wantsGuestLogo ? guestLogo : null, themeVariant);
=======
    const storedLogo = useUIStore((state) => state.customProviderLogos[providerId]);
    const wantsUploadedLogo = Boolean(storedLogo) && !ignoreCustomIcon && providerLogoUploadSupported();
    const themeVariant = useOptionalThemeSystem()?.currentTheme.metadata.variant === 'light' ? 'light' : 'dark';
    const uploadedLogo = useUploadedProviderLogoUrl(providerId, wantsUploadedLogo ? storedLogo : undefined, themeVariant);
    const [undrawableUrls, setUndrawableUrls] = React.useState(NO_URLS);
    const standsIn = (image: RuntimeObjectUrl) => !image.failed && !(image.url && undrawableUrls.has(image.url));
    const showsUpload = wantsUploadedLogo && standsIn(uploadedLogo);
    const chosenIcon = ignoreCustomIcon ? undefined : customIcon;
    const guestLogo = useGuestProviderLogo(providerLogoIds(providerId));
    const wantsGuestLogo = guestLogo !== null && !showsUpload && !chosenIcon;
    const guestLogoUrl = useGuestProviderLogoUrl(wantsGuestLogo ? guestLogo : null, themeVariant);
>>>>>>> upstream/main
    const fallbackIcon = getProviderLogoFallbackIcon(providerId);

    const handleError = React.useCallback(() => {
        handleInternalError();
        externalOnError?.();
    }, [handleInternalError, externalOnError]);

<<<<<<< HEAD
    if (customIcon && !ignoreCustomIcon) {
        return <Icon name={customProviderIconName(customIcon)} className={cn('text-muted-foreground', className)} />;
||||||| bc50ba56aa
    // An upload or an extension's logo keeps its own colours; only the app's
    // monochrome logos below are inverted. Holds its place while it loads, and
    // a failed fetch or draw falls through to the next mark.
    const drawnImage = (url: string) => (
        <img
            src={url}
            alt={alt ?? `${providerId} logo`}
            aria-hidden={alt === '' ? true : undefined}
            className={cn('object-contain', className)}
            draggable={false}
            onError={() => setUndrawableUrls((urls) => new Set(urls).add(url))}
        />
    );
    const slot = <span aria-hidden className={cn('inline-block', className)} />;

    if (showsUpload) return uploadedLogo.url ? drawnImage(uploadedLogo.url) : slot;

    if (chosenIcon) {
        return <Icon name={customProviderIconName(chosenIcon)} className={cn('text-muted-foreground', className)} />;
    }

    if (wantsGuestLogo && standsIn(guestLogoUrl)) {
        if (guestLogoUrl.url) return drawnImage(guestLogoUrl.url);
        // A bundled logo costs no request, so it stays until this one arrives; a models.dev one would be fetched for nothing.
        if (!isBundled) return slot;
=======
    const drawnImage = (url: string) => (
        <img
            src={url}
            alt={alt ?? `${providerId} logo`}
            aria-hidden={alt === '' ? true : undefined}
            className={cn('object-contain', className)}
            draggable={false}
            onError={() => setUndrawableUrls((urls) => new Set(urls).add(url))}
        />
    );
    const slot = <span aria-hidden className={cn('inline-block', className)} />;

    if (showsUpload) return uploadedLogo.url ? drawnImage(uploadedLogo.url) : slot;

    if (chosenIcon) {
        return <Icon name={customProviderIconName(chosenIcon)} className={cn('text-muted-foreground', className)} />;
    }

    if (wantsGuestLogo && standsIn(guestLogoUrl)) {
        if (guestLogoUrl.url) return drawnImage(guestLogoUrl.url);
        if (!isBundled) return slot;
>>>>>>> upstream/main
    }

    if (!hasLogo || !src) {
        if (fallback !== undefined) return <>{fallback}</>;
        return fallbackIcon ? <Icon name={fallbackIcon} className={cn('text-muted-foreground', className)} /> : null;
    }

    if (tint) {
        return (
            <>
            <img src={src} alt="" aria-hidden hidden crossOrigin="anonymous" onError={handleError} />
            <span
                role={alt === '' ? undefined : 'img'}
                aria-label={alt === '' ? undefined : alt ?? `${providerId} logo`}
                aria-hidden={alt === '' ? true : undefined}
                className={cn('inline-block bg-current', className)}
                style={{
                    maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")`,
                    maskSize: 'contain', WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center', WebkitMaskPosition: 'center',
                }}
            />
            </>
        );
    }

    return (
        <img
            src={src}
            alt={alt ?? `${providerId} logo`}
            aria-hidden={alt === '' ? true : undefined}
            className={cn('dark:invert object-contain', className)}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onError={handleError}
        />
    );
};
