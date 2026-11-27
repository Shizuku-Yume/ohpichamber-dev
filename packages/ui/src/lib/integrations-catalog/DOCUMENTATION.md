# Integrations catalog

The Integrations page (sidebar header, next to Archive) offers a hand-picked list of outside services. Each entry installs at user scope through the same routes Settings uses: MCP config, npm plugins, the skills-catalog installer, extensions. The catalog only points at vendor material; every install downloads it from the vendor's own source onto the user's machine. The only vendor material in this repository is the logo each tile shows.

## Ownership

The catalog owns the bundled service definitions, vendor branding, and suitability probe. Settings routes and the skills-catalog installer own installation. Entry and URL changes require review and reach users with the next release. Recheck vendor URLs when changing an entry.

## Invariants

- Every entry has at least 1 installable component. Local MCP commands run on the machine running OpenCode.
- Skill installed checks and uninstall lookups use the SKILL.md frontmatter name when it differs from the folder basename. Extension installed identities match their `panel.id`.
- Missing picker values leave interpolation tokens unresolved, so validation can reject incomplete entries before installation.
- Vendor logos are bundled 128px WebP assets; displaying a tile never fetches a vendor logo at runtime. A simple-icons glyph takes precedence over a vendor logo, then the tile falls back to its sprite icon.
- Without `--register`, the suitability probe only reads the initialization response and OAuth metadata. Registration leaves an unused vendor-side client; the probe requests the authorization page without following redirects and does not complete sign-in.

## Decisions

### Why registry-compatible field names and not catalog-only names

Fields shared with the official MCP Registry `server.json` use its names so importing registry entries stays possible.

### Why a longer local startup timeout and not the default

Local packages download on first run. OpenCode's default 5000ms startup timeout is too short for that download.

### Why vendor colors and not theme tokens

Brand glyphs use simple-icons' CC0 artwork and literal vendor colors so tiles retain the service's own appearance. Glyph colors contrast with the brand fill.

### Why white-backed logos and not transparent logos

Transparent vendor icons receive a white backing so dark marks remain visible on dark tiles.

## Files

| File | Holds |
|---|---|
| `registry.ts` | Every entry, typed. The only list. |
| `brand-icons.ts` | Generated brand glyphs and colors. Edit `generate-brand-icons.mjs`, then run it. |
| `vendor-logos.ts`, `../../assets/integration-logos/` | Vendor app icons for entries simple-icons lacks, written by `generate-vendor-logos.mjs`. |
| `probe-mcp.mjs` | The suitability probe for remote MCP servers (below). |
| `../i18n/messages/integrations-catalog.i18n.ts` | Page strings and each entry's `description` and `details`, all locales. |
| `../../components/views/IntegrationsCatalogView.tsx` | The page: browse, detail, install and uninstall. |

## Entry model

- An entry bundles components: at most one MCP server, plus OpenCode plugins, skills, or an OpenChamber extension. The entry id is also the MCP server name in the user's config.
- A local MCP server declares the environment values it needs in `local.envInputs` (`envName`, label key, `required`). The install form collects them and the Host stores each as a workspace credential referenced from `envCredentialRefs`; the value itself is never written to the MCP config. Do not also ask for the same value as a `{token}` in `command`.
- The main part is the MCP server when the entry has one, else its first component. An entry counts as installed once its main part is; a missing bundled skill gets its own Install on the detail page.
- Uninstall removes only what the catalog put there. Skills are deleted from the user's OpenCode skills folder by `skillDir`, so a same-named skill the user keeps elsewhere survives.
- Enterprise mode hides the whole page (`SidebarHeader`). Administrator-curated sources do not exist yet; see `enterprise-boundary` before changing that.

## What belongs

An entry earns its place when all of these hold:

- **Work-team use.** Engineering, product, design, data or ops work in a company. Consumer services (music, travel, fitness, finance apps) stay out.
- **Vendor-run.** The server, plugin or skill is published by the service itself (`verified: true` means exactly this). Community wrappers of someone else's API stay out.

OpenChamber's own extensions and OpenCode plugins belong too, in the `openchamber` category, with OpenChamber as the publisher. Their Settings cards stay where they are; the catalog is one more place to find them.
- **Installs from the catalog.** One-click OAuth, a token field, or a local command the user's machine can run. A service that first needs an app registered by us or by the user is not suitable yet (see Not suitable yet).
- **Licensed to install.** Skills and plugins come from sources with an open license (MIT, Apache-2.0, ISC, MPL-2.0). Vendor terms instead of a license go in `termsUrl`, which the detail page links. A skill repository with no license is acceptable only when the vendor plainly publishes it for installation (a `skills.sh.json` or install instructions); otherwise leave it out.

Candidates come from vendor docs and from integrations.sh, whose credential notes mark servers that need no app registration as "self-onboarding". Use it to find candidates; the app never fetches it, and nothing is imported from it wholesale.

## Vetting a candidate

1. Find the vendor's official MCP URL in their docs.
2. Run the probe with `--register`:

   ```sh
   node packages/ui/src/lib/integrations-catalog/probe-mcp.mjs https://mcp.example.com/mcp --register
   ```

   It signs in the way OpenCode 2.x does: dynamic client registration as `client_name: "opencode"` with a `http://127.0.0.1:<port>/callback` redirect, then a request for the authorization page. It leaves one unused client registered at the vendor.
3. Read the verdict:

   | Verdict | Entry |
   |---|---|
   | `one-click OAuth` | `auth: 'oauth'` with the remote URL |
   | `open` | `auth: 'none'`, or `auth: 'token'` with `tokenOptional: true` when a key raises limits. Many servers list their tools without sign-in and ask for the account only when a tool runs (Courier, Browserbase, OneUptime, Storyblok): check the vendor docs and use `auth: 'token'` there |
   | `no OAuth metadata` | usually a token header: `auth: 'token'`, `tokenHeader`, `tokenHelpUrl` from the vendor docs |
   | `needs a registered app` or `closed` | not suitable yet |

4. Trust the probe over the vendor's docs, in both directions. Canva's docs demand a waitlist, yet the server registers OpenCode and the sign-in completes; Dropbox refuses a client under another name and accepts `opencode` as a trusted partner. The probe stops at the authorization page, so the token's return to the loopback port is proven only by a real sign-in: say in the handoff which new OAuth entries still need one.

Done when every candidate has a verdict, and every entry you add matches its verdict's row.

## Adding an entry

- Place it in `registry.ts` next to entries of the same auth kind, with one or two categories from `CATALOG_CATEGORY_ORDER`. `CATALOG_FEATURED_IDS` is the opening section; change it only when asked.
- Bundle the vendor's own skills only when they work with the server: the agent uses them alongside its tools (Render deploy and debug, the Exa research orchestrator). Skip skills that teach calling the vendor's REST API by hand, and framework-by-framework families. A skill installs under its folder basename, so the basename must name the skill on its own and stay unique (PostHog's `all` and `api` folders cannot be bundled). Its frontmatter `name` must be a plain kebab-case name OpenCode accepts: Webflow's `webflow-mcp:site-audit` style names are skipped. Skip skills that drive a vendor CLI or their own curl scripts (Tavily, Browserbase, Parallel research, Axiom SRE); the vendor's MCP server is what the entry installs. Set `skillName` when the SKILL.md frontmatter name differs from the folder.
- Plugins pin a major version in `spec` and carry `license`.
- For a local server that needs environment variables, add `envInputs` to `local` instead of putting the value in `command`: one `{ id, envName, labelKey: 'integrationsCatalog.entry.<id>.env.<inputId>', required? }` per variable. Required ones block install while empty; the Host stores each value as a workspace credential and passes it through `envCredentialRefs`. Variables that only apply to some picker choices (MCP Toolbox's non-postgres databases) stay out; the user sets them in Settings → MCP.
- Write `integrationsCatalog.entry.<id>.description` (one line: what the agent does with it) and `.details` (two or three sentences, mention bundled skills) in every locale block; `locale-ui-patterns` owns translation.
- Brand: add the simple-icons slug to `BRANDS` in `generate-brand-icons.mjs` and run it. When simple-icons has no glyph, add the vendor's own app icon to `LOGOS` in `generate-vendor-logos.mjs` (its iOS touch icon, a favicon of 120px or more, or its GitHub organization avatar), run it and look at the result: a GitHub placeholder avatar or a 32px favicon is worse than no logo. Without either the entry shows `icon` from the sprite; a new sprite name needs `bun run icons:generate`.
- Run the catalog tests (`IntegrationsCatalogView.test.tsx`, `registry.test.ts`, `i18n/messages.test.ts`), then `bun run check:changed`.

## Not suitable yet

Probed, with the reason, so they are not retried blind. Recheck when the reason may have changed.

| Service | Reason |
|---|---|
| Slack, HubSpot, Box, PagerDuty | No dynamic registration: needs a registered app (client ID and secret). A catalog field for the user's own OAuth client would open these. |
| Canny, DocuSeal, Front, Loops, Smartsheet, Wrike, Zoom | No dynamic registration (probed 2026-10-15). |
| Checkly, Dovetail | Dynamic registration is advertised but disabled. |
| Calendly, Gamma, Grain, MeetGeek, SignNow | Refuse a loopback redirect URI, which OpenCode needs. |
| DevRev | Rejects `127.0.0.1` as a redirect host. |
| Adobe Acrobat | Accepts only allow-listed client names. |
| Reclaim, Omni | Authorization page answers 401 to a fresh client. |
| Docusign, Mailchimp, Square, Adobe Photoshop and Creativity | Refuse before sign-in. |
| Fullstory, Pendo, Avo | No answer from the listed MCP URL. |
| Google Workspace | Developer Preview program, plus a Google Cloud project and OAuth client per user, or our own verified Google app. |
| Google Cloud (BigQuery and others) | GA, but the same OAuth-client requirement as Workspace. |
| Microsoft 365 | No public hosted server for third-party clients. |
| Anthropic office skills (docx, xlsx, pptx, pdf) | Proprietary license forbids redistribution and use outside Anthropic's products. |
| Figma skill | Kept, with `termsUrl`: governed by Figma Developer Terms. |

## In this fork (OMP)

The entry list, logos and page layout are upstream's. The install side is bound to the fork's canonical stores, and three points differ from the upstream text above:

- **MCP.** `Install` writes a workspace `MCPServerConfig` through `useMcpConfigStore` (stdio command or HTTP URL). A token entry writes one workspace credential (`writeWorkspaceMcpCredential`) and references it from the transport: `credentialRef` for `Authorization` (the Agent Service sends `Bearer <secret>`), `headerCredentialRefs` for any other header. A local server with `envInputs` follows the same credential path in two saves: the server is saved first (enabled, as usual), then each collected value is written as a workspace credential, then one more save adds `envCredentialRefs` keyed by environment variable name. The first save may connect once without its environment; that attempt is not the install's outcome, the save after the references is. Nothing is written to an OpenCode config file. Credential references stored through the user MCP file resolve from every workspace, so an entry with filled environment values may install at either scope; the scope dialog offers both. The page never fetches a logo or an entry at render time: `brand-icons.ts` and the local `assets/integration-logos/*.webp` files are bundled.
- **Skills.** The canonical installer needs a configured skill repository source; the catalog does not add one silently. A skill row links the vendor's folder, and `Install` for a skill opens Settings → Skills catalog, which registers the source, scans it and asks about conflicts. Installed means an authored skill (`authoredSkillId === skillDir`) with the reported name; a read-only or inherited skill never counts.
- **Plugins.** No plugin entry is listed. Upstream's entries (`Langfuse`, `LangSmith`, `Claude Code`, `Search Providers`) are OpenCode npm plugins; OMP loads native `@oh-my-pi/pi-coding-agent` plugins instead. The `plugin` component kind and the install path stay for a native plugin package when one is added.
- **Enterprise mode.** `SidebarHeader` hides the page and the view renders nothing while the mode is on; installs go through the same Host routes as Settings, which own the refusal.

Outbound links (`homepage`, skill source, token help, terms) open in a new tab with `rel="noreferrer"`; they leave only when the user clicks one, and the page itself makes no request to a vendor.
