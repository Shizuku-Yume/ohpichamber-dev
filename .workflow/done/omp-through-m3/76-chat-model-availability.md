# 76: Chat model picker lists only executable providers

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** 7b495354bd6c744f1c9ea924dd71af21afaf25d9
**Started:** 2026-10-22T03:10:22Z

**Delivers:** The canonical workspace model catalog contains models only from providers the native SDK reports as available: configured `models.yml` providers (including keyless `auth: none` endpoints), stored/environment/oauth credentials, and native keyless local providers. The chat model picker therefore cannot list all bundled-but-unconnected providers. The provider catalog itself stays complete so Settings → Providers still offers every connectable provider.

**Blocked by:** None
**Files:** `packages/agent-service/src/worker/catalog-models.ts`, `packages/agent-service/src/worker/catalog-models.test.ts`, `packages/agent-service/DOCUMENTATION.md`.

**Read first:** `packages/agent-service/src/worker/catalog-models.ts` (`readModels`, `readProviders`, `provider`), the pinned `ModelRegistry.getAvailable`/`getAll`/`#createProviderAvailabilityCheck` in `vendor/omp/c9de2b02/tarballs/oh-my-pi-pi-coding-agent-18.8.9.tgz`, and the existing catalog fixture in `catalog-models.test.ts`.
**Covers:** W6, W9

**Related:** Task 75 (unconfigured quota reports empty, not an error) is a separate bugfix owned by the quota lane. It edits `packages/web/server/lib/quota/*` and the quota UI/store; this task does not touch those paths and is not blocked by it.

**Check:** `bun test packages/agent-service/src/worker/catalog-models.test.ts` → the new availability test fails before the change (unconfigured bundled providers appear) and passes after; a configured custom provider and a keyless custom provider stay in the catalog while an unconfigured bundled provider is absent from `ModelCatalog` but still present in `ProviderCatalog`.

- [x] `readModels` derives its model set from the SDK availability predicate (`getAvailable('all')`), not from the full bundled catalog.
- [x] A keyless custom provider (`auth: none`) remains selectable.
- [x] A custom provider with a configured credential remains selectable.
- [x] Unconfigured bundled providers are absent from the model catalog but still present in `readProviders` for Settings.
- [x] No provider-ID string allow/deny list and no secret value is introduced.
- [x] Owning documentation states that `ModelCatalog` is the executable workspace catalog while `ProviderCatalog` is the complete directory.

## Progress

Dirty at start: none.

Root cause: `readModels` built the public `ModelCatalog` from `ModelRegistry.getAll('all')`, the complete bundled plus custom registry. Every bundled provider therefore arrived with models and the picker kept each provider that had any model. `readProviders` used the same full registry for its identity set, which is the behavior Settings needs.

Check before: reverting only the `readModels` line to `getAll('all')` and running `bun test packages/agent-service/src/worker/catalog-models.test.ts --test-name-pattern "executable providers"` failed at `expect(catalogProviders.has(unconfigured!)).toBe(false)` with `Received: true`.

Check after: `bun test packages/agent-service/src/worker/catalog-models.test.ts` → 31 pass, 0 fail, 112 expect() calls. `bun run --cwd packages/agent-service type-check` → exit 0. `bunx oxlint packages/agent-service/src/worker/catalog-models.ts packages/agent-service/src/worker/catalog-models.test.ts` → exit 0.

Real path: the already-running installed Host/service catalog was read without sending a completion. It published 96 providers and 4641 models, including the user's CLIProxyAPI provider with 12 enabled models. Applying the availability filter leaves only the configured chat provider set; this lane did not rebuild or replace the installed app.

Dependency reuse (no install): temporary hardlinked trees were copied from `/home/shizuku/Project/ohpichamber-worktrees/ui-providers-restore` (`node_modules`, `packages/agent-service/node_modules`, `packages/agent-contract/node_modules`), `packages/agent-contract` was built for module resolution, and all three temporary trees plus generated `dist` were removed before commit. No lockfile, manifest or dependency version changed.

Review: security pass not triggered — this is a read-only availability filter over the existing native catalog and adds no credential, path, network or authorization surface. No blocking findings.

**Finished:** 2026-10-22T03:22:00Z
