# Pinned OMP package inputs

These archives come from OMP revision `c9de2b02b997f37cc89639282ed35dec86f139e8`, retained by task24. The matching registry version `18.8.9` is not an equivalent source identity.

`copy-manifest.json` records each repository-relative input, SHA-256 and size, with the immutable artifact-set identity. The 13 first-party archives include their licenses and native notices. Keep their bytes unchanged. Root package overrides select these local archives; installation and runtime resolution must not depend on the original source checkout or artifact custody directory.

`dependency-owners.json` records the 225 version-scoped parent/dependency bindings derived from task24's installed SDK consumer. They preserve the SDK closure without globally replacing application dependency versions. Root `bun.lock` records the resolved graph; use `bun install --frozen-lockfile --ignore-scripts` for reproduction.

The retained `@ark/schema@0.56.2` and `puppeteer-core@25.3.0` patches are applied through root `patchedDependencies`. The Linux x64 native archive is included. Non-Linux native execution and equivalence to a native source build remain unverified.

The service's `src/sdk-assets.d.ts` copies the pinned source's asset declarations (`types/assets/index.d.ts`, SHA-256 `bf20c22cdf85a50009831eb6b8fb097286557ac6ba5bddd2c519aca26e51842e`). Its TypeScript configuration uses the SDK's ES2024/Bun settings; these declarations describe text imports, not a replacement SDK API.
