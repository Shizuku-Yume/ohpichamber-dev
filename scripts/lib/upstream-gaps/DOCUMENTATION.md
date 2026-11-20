# Upstream gap audits

`scripts/upstream-gaps.mjs` compares the working tree with the revision in
`.workflow/upstream-baseline.json`. `--upstream-ref` selects a different revision
for investigations and isolated Git fixtures. Allowlist entries must describe
current gaps and cite an existing decision or Canonical/Host owner.

The server audit reads production JavaScript and TypeScript across the server
and CLI, rather than assuming a fixed set of bootstrap monoliths. Electron
references count when checking public Host exports. Tests, fixtures, dependency
trees and generated output are not production coverage. Imports alone never
count as using a constructor or mounting routes.

The route audit follows source imports from the server entry, including `.js`
specifiers whose source owner is TypeScript. A reachable route module must still
be used, and a mounted 404 fallback is not endpoint coverage.

The settings audit follows relative store imports so split type, action and
persistence owners retain their checks. A setter declaration without an
implementation is a gap. Sanitizers are read from their current `settings/`
owner or the historical Host/OpenCode location when comparing older revisions.

Run `node --test scripts/upstream-gaps.test.mjs` and
`node scripts/upstream-gaps.mjs --check`.
