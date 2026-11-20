import { usePermissionStore } from '@/stores/permissionStore';



export function useComposerPermissionSettings() {
    const setSessionMode = usePermissionStore((state) => state.setSessionMode);

    return {
        setSessionMode,
    };
}
