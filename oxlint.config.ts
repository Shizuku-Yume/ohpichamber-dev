import { defineConfig } from "oxlint";
import legacyServerSources from "./packages/web/scripts/fork-owned-server-untyped.json" with { type: "json" };

// The repository's general-purpose lint, run by `bun run lint` and failing on
// any finding, and the config editors pick up by default.
// `oxlint.anti-slop.config.ts` is the separate anti-slop config, which keeps a
// backlog and is enforced only as a ratchet over changed files.
//
// The rule set is ESLint's and typescript-eslint's recommended sets plus the
// React hooks and fast-refresh rules, the set this repository linted with
// under ESLint.
const TYPESCRIPT_FILES = ["**/*.ts", "**/*.tsx"];

export default defineConfig({
  plugins: ["eslint", "typescript", "react"],
  jsPlugins: [
    { name: "openchamber", specifier: "./tools/oxlint/openchamber/index.ts" },
  ],
  categories: {
    correctness: "off",
  },
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/ios/**",
    "**/android/**",
  ],
  rules: {
    // One grammar owns a model selector; this finds ad-hoc `/`/`:` splits and
    // template joins outside packages/agent-contract/src/modelSelector.ts. It
    // sits at the top level because the Host's parsers are `.js`.
    "openchamber/no-model-ref-splitting": "error",
    // One registry owns tool names and their presentation; this finds literal
    // `toolName === "read"` comparisons outside it.
    "openchamber/no-tool-name-literal": "error",
    // Explanatory prose on SettingsCheckboxRow and SettingsFieldRow goes behind info=.
    "openchamber/no-static-row-description": "error",
  },
  overrides: [
    {
      files: TYPESCRIPT_FILES,
      rules: {
        "for-direction": "error",
        "no-async-promise-executor": "error",
        "no-case-declarations": "error",
        "no-compare-neg-zero": "error",
        "no-cond-assign": ["error", "except-parens"],
        "no-constant-binary-expression": "error",
        "no-constant-condition": ["error", { checkLoops: "allExceptWhileTrue" }],
        "no-control-regex": "error",
        "no-debugger": "error",
        "no-delete-var": "error",
        "no-dupe-else-if": "error",
        "no-duplicate-case": "error",
        "no-empty": "error",
        "no-empty-character-class": "error",
        "no-empty-pattern": "error",
        "no-empty-static-block": "error",
        "no-ex-assign": "error",
        "no-extra-boolean-cast": "error",
        "no-fallthrough": "error",
        "no-global-assign": "error",
        "no-invalid-regexp": "error",
        "no-irregular-whitespace": "error",
        "no-loss-of-precision": "error",
        "no-misleading-character-class": "error",
        "no-nonoctal-decimal-escape": "error",
        "no-prototype-builtins": "error",
        "no-regex-spaces": "error",
        "no-self-assign": ["error", { props: true }],
        "no-shadow-restricted-names": "error",
        "no-sparse-arrays": "error",
        "no-unexpected-multiline": "error",
        "no-unsafe-finally": "error",
        "no-unsafe-optional-chaining": "error",
        "no-unused-labels": "error",
        "no-unused-private-class-members": "error",
        "no-useless-backreference": "error",
        "no-useless-catch": "error",
        "no-useless-escape": "error",
        "require-yield": "error",
        "use-isnan": "error",
        "valid-typeof": "error",
        "no-var": "error",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error",
        "no-unused-vars": "error",
        "no-unused-expressions": "error",
        "no-array-constructor": "error",
        "typescript/ban-ts-comment": "error",
        "typescript/no-duplicate-enum-values": "error",
        "typescript/no-empty-object-type": "error",
        "typescript/no-explicit-any": "error",
        "typescript/no-extra-non-null-assertion": "error",
        "typescript/no-misused-new": "error",
        "typescript/no-namespace": "error",
        "typescript/no-non-null-asserted-optional-chain": "error",
        "typescript/no-require-imports": "error",
        "typescript/no-this-alias": "error",
        "typescript/no-unnecessary-type-constraint": "error",
        "typescript/no-unsafe-declaration-merging": "error",
        "typescript/no-unsafe-function-type": "error",
        "typescript/no-wrapper-object-types": "error",
        "typescript/prefer-as-const": "error",
        "typescript/prefer-namespace-keyword": "error",
        "typescript/triple-slash-reference": "error",
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "react/only-export-components": ["error", { allowConstantExport: true }],
      },
    },
    {
      files: ["packages/web/server/**/*.ts", "packages/web/bin/**/*.ts"],
      rules: {
        "openchamber/server-js-specifiers": "error",
        "typescript/no-non-null-assertion": "error",
        "typescript/ban-ts-comment": ["error", {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "minimumDescriptionLength": 10,
        }],
      },
    },
    {
      files: legacyServerSources.files.map(({ path }) => `packages/web/${path}`),
      rules: { "typescript/no-non-null-assertion": "off" },
    },
    {
      files: ["packages/ui/src/**/*.ts", "packages/ui/src/**/*.tsx"],
      rules: {
        // The rule is vendored and wired here, but the fork's UI still carries
        // physical side classes; enabling it now would fail every build with
        // findings the RTL conversion owns. Task 20 of the upstream refresh
        // converts the layout and flips this to the upstream setting.
        "openchamber/no-physical-sides": "off",
        // Freshness must compare one clock with itself. The rule landed with
        // the fixes that removed the last cross-clock comparison; keep it on so
        // a new `>= session.updatedAt` cannot return silently.
        "openchamber/no-cross-source-time-compare": "error",
      },
    },
  ],
});
