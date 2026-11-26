# 02: Authorize image generation as provider use and test advisor refusal

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W2
**Files:** `packages/agent-service/src/worker/{stateless,catalog-models,native-policy-protocol,session-native.test}.ts`, `packages/agent-service/src/native-policy-protocol.ts`, `packages/web/server/lib/host/worker-operation-authorizer.*`, the SDK patch under `vendor/omp/a7135b8f/patches/` only if the advisor test needs a seam, `packages/docs/content/docs/**/security.mdx`
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/decisions.md` entries "Image generation is a provider.use with purpose image" and "Every SDK-built session in the worker inherits Host authorization and fails closed without it"; `.workflow/technical-debt.md` entries "Image generation authorizes provider entry instead of provider use", "Advisor overflow compaction refusal has no behavioral test" and "Security docs enterprise mode still mentions update checks"; `packages/agent-service/DOCUMENTATION.md`; `packages/web/server/lib/host/DOCUMENTATION.md`; `.agents/skills/enterprise-boundary/SKILL.md`
**Check:** `TMPDIR=<task tmp> bun run --cwd packages/agent-service test && bun run --cwd packages/web test -- server/lib/host/worker-operation-authorizer.test.js && bun run docs:validate` → all pass, including new tests: image generation admitted for an enabled provider at the same endpoint with another model, refused for another endpoint or a disabled provider with zero provider requests; advisor overflow compaction with the candidate denied sends no provider request and shows the Host refusal.

- [ ] `catalog.image.generate` requests `provider.use` with `purpose: 'image'` before any credential mint; refusal reaches the user as the Host's reason.
- [ ] Host authorizer admits `purpose: 'image'` by the embedding rule and redacts endpoints in refusal details the same way.
- [ ] Advisor overflow compaction refusal is driven through the WATCHDOG.yml fixture; revert the skip in the installed SDK copy once to prove the test fails, then restore it byte-identical.
- [ ] Remove the enterprise-mode update-check bullet from `security.mdx` and every localized copy.
- [ ] Update both DOCUMENTATION.md files; delete the three `technical-debt.md` entries in the fixing commit.
