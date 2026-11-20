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
Typed constructor calls count too. Dependency comparison tracks named object
properties, not spread-variable names, whose contents cannot be inferred.
A same-file reference outside an export's declaration counts as a caller.
Dependency keys are compared within the same logical source owner (`.ts` and
`.js` are equivalent), not pooled across unrelated factories with the same name.
An indirect options argument does not prove that its properties are absent.
Such calls remain failing `route-deps-indirect` findings requiring an explicit
owner review, rather than a separate false missing-property claim for every key.
Literal empty objects and removed arguments still report named omissions.

The route audit follows source imports from the server entry, including `.js`
specifiers whose source owner is TypeScript. A reachable route module must still
be used, and a mounted 404 fallback is not endpoint coverage.
Express calls with TypeScript type arguments count as registrations, and
converted `.ts` router owners keep the same mount prefixes as their `.js` owners.
Request-method inference reads only that request's options object, not a later
request in the same source file.

The settings audit follows relative store imports so split type, action and
persistence owners retain their checks. A setter declaration without an
implementation is a gap. Sanitizers are read from their current `settings/`
owner or the historical Host/OpenCode location when comparing older revisions.
Named sanitizer key lists support TypeScript annotations and count only when
the sanitizer iterates them. A declared but unused list is not coverage, and
properties of unrelated project-normalization helpers are not settings keys.

Run `node --test scripts/upstream-gaps.test.mjs` and
`node scripts/upstream-gaps.mjs --check`.
