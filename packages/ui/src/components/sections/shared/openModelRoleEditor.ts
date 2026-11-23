import { useUIStore } from '@/stores/useUIStore';

/** Opens the Model roles page at one role's editor. */
export const openModelRoleEditor = (role: string): void => {
  useUIStore.getState().requestSettingsJump('model-roles', `omp.modelRoles.${role}`);
};
