import { eslintCompatPlugin } from "@oxlint/plugins";

import { noCrossSourceTimeCompareRule } from "./rules/no-cross-source-time-compare.ts";
import { noModelRefSplittingRule } from "./rules/no-model-ref-splitting.ts";
import { noToolNameLiteralRule } from "./rules/no-tool-name-literal.ts";
import { noStaticRowDescriptionRule } from "./rules/no-static-row-description.ts";
import { gatekeeperStandardLibraryRule } from "./rules/gatekeeper-standard-library.ts";

import { noAppImportsInOpencodeRule } from "./rules/no-app-imports-in-opencode.ts";
import { noCommentsRule } from "./rules/no-comments.ts";
import { noCrossRuntimeImportsRule } from "./rules/no-cross-runtime-imports.ts";
import { noEffectsInComponentsRule } from "./rules/no-effects-in-components.ts";
import { noModuleMocksInTestsRule } from "./rules/no-module-mocks-in-tests.ts";
import { noPhysicalSidesRule } from "./rules/no-physical-sides.ts";
import { noRawFetchRule } from "./rules/no-raw-fetch.ts";
import { noRealWaitsInTestsRule } from "./rules/no-real-waits-in-tests.ts";
import { noSessionListScanInSelectorsRule } from "./rules/no-session-list-scan-in-selectors.ts";
import { noSourceTextInTestsRule } from "./rules/no-source-text-in-tests.ts";
import { noTimersRule } from "./rules/no-timers.ts";
import { noValueofTypeEscapeRule } from "./rules/no-valueof-type-escape.ts";
import { noVirtualizerReturnFromHooksRule } from "./rules/no-virtualizer-return-from-hooks.ts";
import { noWireClientImportsRule } from "./rules/no-wire-client-imports.ts";
import { originCheckAwaitedRule } from "./rules/origin-check-awaited.ts";
import { serverJsSpecifiersRule } from "./rules/server-js-specifiers.ts";

/**
 * OpenChamber's own lint rules. `oxlint.config.ts` runs the ones the code
 * already satisfies and fails on any finding; `oxlint.anti-slop.config.ts`
 * runs the ones with a backlog, as a ratchet over changed files.
 */
const openchamberPlugin = eslintCompatPlugin({
  meta: { name: "openchamber" },
  rules: {
    "no-cross-source-time-compare": noCrossSourceTimeCompareRule,
    "no-model-ref-splitting": noModelRefSplittingRule,
    "no-tool-name-literal": noToolNameLiteralRule,
    "no-static-row-description": noStaticRowDescriptionRule,
    "gatekeeper-standard-library": gatekeeperStandardLibraryRule,
    "no-app-imports-in-opencode": noAppImportsInOpencodeRule,
    "no-comments": noCommentsRule,
    "no-cross-runtime-imports": noCrossRuntimeImportsRule,
    "no-effects-in-components": noEffectsInComponentsRule,
    "no-module-mocks-in-tests": noModuleMocksInTestsRule,
    "no-physical-sides": noPhysicalSidesRule,
    "no-raw-fetch": noRawFetchRule,
    "no-real-waits-in-tests": noRealWaitsInTestsRule,
    "no-session-list-scan-in-selectors": noSessionListScanInSelectorsRule,
    "no-source-text-in-tests": noSourceTextInTestsRule,
    "no-timers": noTimersRule,
    "no-valueof-type-escape": noValueofTypeEscapeRule,
    "no-virtualizer-return-from-hooks": noVirtualizerReturnFromHooksRule,
    "no-wire-client-imports": noWireClientImportsRule,
    "origin-check-awaited": originCheckAwaitedRule,
    "server-js-specifiers": serverJsSpecifiersRule,
  },
});

export default openchamberPlugin;
