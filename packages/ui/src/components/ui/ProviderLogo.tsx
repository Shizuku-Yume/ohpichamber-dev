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
    ignoreCustomIcon?: boolean;
    fallback?: React.ReactNode;
    tint?: boolean;
}

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
    const fallbackIcon = getProviderLogoFallbackIcon(providerId);

    const handleError = React.useCallback(() => {
        handleInternalError();
        externalOnError?.();
    }, [handleInternalError, externalOnError]);

    if (customIcon && !ignoreCustomIcon) {
        return <Icon name={customProviderIconName(customIcon)} className={cn('text-muted-foreground', className)} />;
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
