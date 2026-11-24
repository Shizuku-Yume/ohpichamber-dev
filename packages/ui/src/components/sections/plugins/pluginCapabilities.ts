import type { ExtensionInventory, ExtensionKind } from '@openchamber/agent-contract';

const BUNDLED_PROVIDER_ID = 'builtin-defaults';
const OPENSSH_PROVIDER_ID = 'openssh-config';

export const PLUGIN_CAPABILITY_KINDS: ReadonlySet<ExtensionKind> = new Set([
  'extension-module',
  'hook',
  'tool',
]);

const EXCLUDED_PROVIDER_IDS: ReadonlySet<string> = new Set([
  OPENSSH_PROVIDER_ID,
  BUNDLED_PROVIDER_ID,
]);

export function filterPluginCapabilities(inventory: ExtensionInventory): ExtensionInventory {
  const items = inventory.items.filter(
    item =>
      PLUGIN_CAPABILITY_KINDS.has(item.kind)
      && !EXCLUDED_PROVIDER_IDS.has(item.providerId)
      && item.scope !== 'builtin',
  );
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.providerId, (counts.get(item.providerId) ?? 0) + 1);
  }
  const providers = inventory.providers
    .filter(provider => !EXCLUDED_PROVIDER_IDS.has(provider.id) && (counts.get(provider.id) ?? 0) > 0)
    .map(provider => ({ ...provider, itemCount: counts.get(provider.id) ?? 0 }));
  const kinds = inventory.kinds.filter(entry => PLUGIN_CAPABILITY_KINDS.has(entry.kind));
  return {
    providers,
    items,
    warnings: inventory.warnings,
    kinds,
  };
}
