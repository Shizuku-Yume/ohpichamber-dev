# Built-in extensions

App-owned extensions live here and use the public `@openchamber/sdk` contract. This directory owns built-in extension manifests and bundles staged to `@openchamber/web/server/built-in-extensions/`. This directory is not a Bun workspace and adds no runtime dependencies. The build resolves SDK entrypoints from the SDK workspace.

### Migration status

Built-in extension packages are retained under the Guest Extension contract (`SCOPE-16.0` in `.workflow/omp-migration/scope.md`) and run on Web and Electron surfaces. The VS Code extension form has been removed (`SCOPE-2.3`), and mobile sandboxed iframe support is scheduled for milestone M5.

From the repository root:

```bash
bun run extensions:build
```

`registry.json` is the allowlist. Each entry names a package directory, explicit files to ship, and browser or Node build entries. Browser entries must produce a single IIFE; embed imported images rather than relying on runtime-relative URLs. The build stamps package versions with the app version and validates the finished packages with the same parser as user installs.

Output goes to `packages/web/server/built-in-extensions/`. It is generated, ignored by Git, and included in the web package. Root installation, web builds and web packaging build it automatically. Rebuild after editing a built-in, then reopen its panel. Registry changes require a server restart.

Packaged Electron unpacks these resources from ASAR so future service entries can run as ordinary files. The backend selects its app-owned registry; user extensions and user data are stored separately.

The registry is currently empty. Builds still ship an empty registry and remove resources from previously bundled extensions. Build tests create temporary fixtures instead of shipping a demo.

Implementation and trust rules: [DOCUMENTATION.md](./DOCUMENTATION.md).
