# Product documentation source

This directory contains product documentation for the pinned inherited OpenChamber baseline.

OhPiChamber's target is Oh My Pi (OMP) as its sole agent runtime, retaining Web/PWA, Electron desktop, Mobile and the Guest SDK. OpenCode runtime integration and the VS Code extension package remain in the inherited source until their later cutover. These guides describe that inherited runtime, not completed OMP support.

## Layout

- `content/docs/*.mdx`: English docs pages (source of truth)
- `content/docs/<locale>/*.mdx`: translations mirroring English filenames (`uk/`, `zh-cn/`, `pt-br/`, `fr/`, `tr/`); see `CONTRIBUTING.md`
- `sidebar.config.json`: docs navigation structure for the Starlight sidebar
- `CONTRIBUTING.md`: authoring guide for adding pages, sections, and translations
- `DEPLOYMENT.md`: packaging and sync trigger model

## Local validation

Run from repo root:

```bash
bun run docs:validate
```

This validates:

- frontmatter (`title`, `description`) exists for every MDX page
- sidebar links resolve to existing MDX routes

## Deployment model

This repository owns documentation content.

Website rendering and deployment occur in `openchamber-website` (`apps/docs`).

Use `.github/workflows/docs-source.yml` to package docs source on release or manual trigger.
