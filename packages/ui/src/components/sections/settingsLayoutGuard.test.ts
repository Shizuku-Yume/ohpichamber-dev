import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Settings layout guard.
 *
 * Settings rows and section spacing come from the named classes in
 * `shared/SettingsSection.tsx`; layout.md and PATTERNS.md explain why (one row
 * pattern, one control width, one spacing scale, container queries only). This
 * test enforces that by scanning the JSX under `components/sections` and
 * rejecting the ad-hoc utilities that produced the ragged right column, the
 * doubled section rhythm and the drifting gaps.
 *
 * Rules, each reported with file:line:
 *
 * - W  a raw width utility (`w-48`, `w-[…]`, `w-fit`, `max-w-md`, `min-w-[1rem]`,
 *      with or without a variant prefix) on a settings control — SelectTrigger,
 *      Input, Textarea, NumberInput, the model/agent/project pickers — or in
 *      `controlClassName`/`containerClassName`/`triggerClassName`. `w-full`,
 *      `min-w-0`, `max-w-none` and `max-w-full` only say "fill", "may shrink"
 *      or "stay in the column", so they stay allowed.
 * - S  a `space-y-*` wrapper around `SettingsSection` children: sections own
 *      their vertical rhythm (`py-8`), so a page must not stack them again.
 *      `space-y-0` is the documented "no extra spacing" spelling and passes.
 * - P  page padding on `SettingsPageLayout`: the page layout owns it
 *      (`px-6 @3xl:px-12`).
 * - B  a viewport breakpoint (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) in settings pane
 *      content. The pane is much narrower than the viewport, so its content
 *      responds with container queries (`@xl:`, `@3xl:`). Hover-only opacity
 *      affordances pass: there the prefix selects desktop pointer behaviour
 *      (`md:group-hover:opacity-100`), not a pane width. A modal dialog sizes
 *      to the window, so elements under a `Dialog`/`AlertDialog` pass.
 * - N  `SETTINGS_WIDTH_NUMBER_CLASS` applied outside a
 *      `SETTINGS_NUMBER_STEPPER_ROW_CLASS` row: the fixed width exists to size a
 *      stepper, and a bare one leaves a stub on the line.
 * - G  spacing utilities where the named classes own the decision: margin
 *      (`mt-2`, `mb-4`, `mx-auto`, …), non-zero `gap-*` and non-zero
 *      `space-x-/space-y-*` on a settings control, on a
 *      `SettingsFieldRow`/`SettingsStackedField`/`SettingsCheckboxRow`, or a
 *      non-zero `space-y-*` in a `SettingsSection`/`SettingsControlGroup`
 *      `contentClassName`. Zero values (`m-0`, `gap-0`, `space-y-0`) and
 *      generic wrappers (a `div` may carry its own gap) stay allowed.
 *
 * File exceptions are listed with their reason below and stay narrow:
 * navigation/sidebar chrome (layout.md "Exception"), the project settings
 * dialog shell, and two shared editors that are not settings field rows.
 * `shared/SettingsSection.tsx` is excluded because it defines the vocabulary.
 *
 * The scan is only as good as the lexer, so two checks keep it honest. Every
 * scanned file must parse to EOF with each element finding its own closing
 * tag: a hole (a regex literal holding a quote, an arrow generic read as JSX)
 * used to swallow the rest of the file silently, and now fails by name. And
 * for every file that has a control, the test appends a raw width and injects
 * one mid-file, asserting both are found; a region the lexer skips cannot
 * pass both.
 */

const SECTIONS_ROOT = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = dirname(SECTIONS_ROOT);

/**
 * Settings-pane views rendered by settings pages outside `components/sections`
 * (Usage page embeds `UsageStatsReport`; Skills page embeds `PreviewToggleButton`;
 * Repository bindings embed `GitOperationStatus`; About page embeds `ReleaseNotesBody`).
 */
const PANE_VIEW_SOURCES: readonly string[] = [
  'views/usage/UsageStatsView.tsx',
  'views/PreviewToggleButton.tsx',
  'views/git/GitOperationStatus.tsx',
  'update/ReleaseNotesBody.tsx',
];

const RULES = ['W', 'S', 'P', 'B', 'N', 'G'] as const;
type Rule = (typeof RULES)[number];

/** Attributes that carry class names for a control or its wrapper. */
const CLASS_ATTRS: Record<string, true> = {
  className: true,
  controlClassName: true,
  containerClassName: true,
  triggerClassName: true,
  contentClassName: true,
};

/** Components that are settings controls (or the trigger of one). */
const CONTROL_TAGS: Record<string, true> = {
  Input: true,
  Textarea: true,
  NumberInput: true,
  Select: true,
  SelectTrigger: true,
  ModelSelector: true,
  AgentSelector: true,
  SettingsProjectSelector: true,
  SettingsColorField: true,
  SortableTabsStrip: true,
};
/** Row primitives: their own padding/stack is the row contract, not the page's. */
const ROW_TAGS: Record<string, true> = {
  SettingsFieldRow: true,
  SettingsStackedField: true,
  SettingsCheckboxRow: true,
};

/** Clusters whose content stack is a named `SETTINGS_SPACE_*` decision. */
const CONTENT_STACK_TAGS: Record<string, true> = {
  SettingsSection: true,
  SettingsControlGroup: true,
};

/** Width tokens that only say "fill", "may shrink" or "stay in the column". */
const NEUTRAL_WIDTH_TOKENS: Record<string, true> = {
  'w-full': true,
  'min-w-0': true,
  'max-w-none': true,
  'max-w-full': true,
};

/** Row-level primitives: a number stepper belongs inside the row's own band. */
const ROW_BOUNDARY_TAGS: Record<string, true> = {
  SettingsSection: true,
  SettingsFieldRow: true,
  SettingsStackedField: true,
  SettingsControlGroup: true,
  SettingsTwoColumn: true,
  SettingsPageLayout: true,
};

const NUMBER_WIDTH_CLASS = 'SETTINGS_WIDTH_NUMBER_CLASS';
const NUMBER_STEPPER_ROW_CLASS = 'SETTINGS_NUMBER_STEPPER_ROW_CLASS';

const VIEWPORT_BREAKPOINT = /^(?:sm|md|lg|xl|2xl):(.+)$/;
const HOVER_OPACITY = /^(?:sm|md|lg|xl|2xl):(?:(?:group-hover|hover|focus|focus-visible):)?opacity-/;
/** Modal chrome sizes to the viewport; its body still follows the pane rules. */
const DIALOG_CHROME_TAG = /^(?:Dialog|AlertDialog)/;

interface FileException {
  readonly match: RegExp;
  /** Rules the file is exempt from; omit for every rule. */
  readonly rules?: readonly Rule[];
  readonly reason: string;
}

const FILE_EXCEPTIONS: readonly FileException[] = [
  {
    match: /(^|\/)[A-Za-z0-9]*Sidebar\.tsx$/,
    reason: 'navigation chrome outside the pane (layout.md Exception)',
  },
  {
    match: /(^|\/)SettingsSidebar(?:Item|Layout|Search)?\.tsx$/,
    reason: 'navigation chrome outside the pane (layout.md Exception)',
  },
  {
    match: /(^|\/)ProjectSettings(?:Panel|Header)\.tsx$/,
    reason: 'project settings dialog shell: header and tab strip are modal chrome',
  },
  {
    match: /(^|\/)shared\/SettingsColorField\.tsx$/,
    rules: ['W'],
    reason: 'hex field is sized to a #RRGGBB swatch, not to a settings field row',
  },
  {
    match: /(^|\/)shared\/EnvironmentVariablesEditor\.tsx$/,
    rules: ['W'],
    reason: 'bespoke name/value row editor, not a settings field row',
  },
];

interface JsxAttr {
  readonly name: string;
  /** Raw value source, quotes or braces included; empty for a bare attribute. */
  readonly raw: string;
  readonly start: number;
}

interface JsxElement {
  readonly tag: string;
  readonly attrs: readonly JsxAttr[];
  readonly start: number;
  readonly parent: JsxElement | null;
  /** Elements in child position (not ones nested in an attribute expression). */
  readonly children: JsxElement[];
  /** Set when the element never found its own closing tag. */
  validationError?: boolean;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: Rule;
  readonly detail: string;
}

interface ParseResult {
  /** Every element the lexer saw, in document order. */
  readonly elements: JsxElement[];
  /** False when a string, comment, tag or brace ran past EOF or closed wrong. */
  readonly complete: boolean;
}

interface ScanContext {
  readonly elements: JsxElement[];
  truncated: boolean;
}

const TAG_NAME_PART = /[\w$.:-]/;

function isNamePart(character: string | undefined): boolean {
  return character !== undefined && TAG_NAME_PART.test(character);
}

/** Skip a quoted string or template literal, including `${…}` code in a template. */
function scanString(
  source: string,
  start: number,
  limit: number,
  parent: JsxElement | null,
  context: ScanContext,
): number {
  const quote = source[start];
  let index = start + 1;
  while (index < limit) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === quote) return index + 1;
    if (quote === '`' && character === '$' && source[index + 1] === '{') {
      index = scanCode(source, index + 2, limit, parent, context, true);
      continue;
    }
    index += 1;
  }
  context.truncated = true;
  return limit;
}

/**
 * A `/` starts a regex rather than a division when the previous token cannot
 * end an expression. Without this, a regex body containing a quote or a
 * backtick (`/[^!#$%&'*+._`|~]/g`) is read as a string and swallows the file.
 */
function isRegexAllowed(source: string, slashIndex: number): boolean {
  let previous = slashIndex - 1;
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
  if (previous < 0) return true;

  const character = source[previous];
  if ('(,=:[!&|?{};+-*%<>~^'.includes(character)) return true;
  if (!/[A-Za-z_$]/.test(character)) return false;

  let wordStart = previous;
  while (wordStart > 0 && /[A-Za-z_$]/.test(source[wordStart - 1])) wordStart -= 1;
  return /^(?:return|typeof|instanceof|case|in|of|new|delete|void|do|else|yield|await|throw)$/
    .test(source.slice(wordStart, previous + 1));
}

function skipRegex(source: string, start: number): number {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '\n') return index;
    if (character === '[') inCharacterClass = true;
    else if (character === ']') inCharacterClass = false;
    else if (character === '/' && !inCharacterClass) {
      index += 1;
      while (index < source.length && /[a-z]/i.test(source[index])) index += 1;
      return index;
    }
    index += 1;
  }
  return index;
}

/**
 * True when `<` at `index` starts a JSX element rather than a comparison or a
 * type argument list: the tag name must follow the angle bracket, and the
 * preceding token must not be an identifier or number (`Array<string>`,
 * `count < 5`).
 */
function isJsxStart(source: string, index: number): boolean {
  let after = index + 1;
  while (after < source.length && /\s/.test(source[after])) after += 1;
  if (source[after] === '>') return true;
  if (after >= source.length || !/[A-Za-z_$]/.test(source[after])) return false;

  let previous = index - 1;
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
  if (previous < 0) return true;

  const character = source[previous];
  if (!/[\w$]/.test(character)) return true;

  // `return <p>`, `yield <X>`, `default <Y>`, `else <Z>`: a keyword can end a
  // statement and still be followed by JSX.
  let wordStart = previous;
  while (wordStart > 0 && /[A-Za-z_$]/.test(source[wordStart - 1])) wordStart -= 1;
  return /^(?:return|yield|default|else|do|await|case|throw)$/.test(source.slice(wordStart, previous + 1));
}

/**
 * Scan JavaScript (and the JSX inside it) from `start` to `limit`.
 * `stopAtBrace` ends the scan after the matching `}` (the caller consumed the
 * opening brace), so an attribute expression, a child expression and a code
 * block all recurse through here.
 */
function scanCode(
  source: string,
  start: number,
  limit: number,
  parent: JsxElement | null,
  context: ScanContext,
  stopAtBrace: boolean,
): number {
  let index = start;
  while (index < limit) {
    const character = source[index];

    if (character === '/') {
      const next = source[index + 1];
      if (next === '/') {
        const newline = source.indexOf('\n', index);
        index = newline < 0 || newline >= limit ? limit : newline + 1;
        continue;
      }
      if (next === '*') {
        const close = source.indexOf('*/', index + 2);
        if (close < 0) {
          context.truncated = true;
          return limit;
        }
        index = close + 2;
        continue;
      }
      if (isRegexAllowed(source, index)) {
        index = skipRegex(source, index);
        continue;
      }
      index += 1;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      index = scanString(source, index, limit, parent, context);
      continue;
    }

    if (character === '{') {
      index = scanCode(source, index + 1, limit, parent, context, true);
      continue;
    }

    if (character === '}') {
      if (stopAtBrace) return index + 1;
      index += 1;
      continue;
    }

    if (character === '<' && isJsxStart(source, index)) {
      const next = readElement(source, index, parent, context);
      index = next ?? index + 1;
      continue;
    }

    index += 1;
  }

  if (stopAtBrace) context.truncated = true;
  return index;
}

/**
 * Read the children of an open element up to and including its closing tag.
 * Returns `-1` when this was not a real element after all (no matching close),
 * so the caller can fall back to reading the `<` as text: a generic arrow
 * (`<Item extends Row>(…)`) must not swallow the rest of the file.
 */
function readChildren(source: string, start: number, parent: JsxElement, context: ScanContext): number {
  const limit = source.length;
  let index = start;

  while (index < limit) {
    const character = source[index];

    if (character === '<') {
      if (source[index + 1] === '/') {
        const close = source.indexOf('>', index + 2);
        if (close < 0) {
          markUnbalanced(parent);
          return -1;
        }
        if (parent.tag.length > 0 && source.slice(index + 2, close).trim() !== parent.tag) {
          markUnbalanced(parent);
          return -1;
        }
        return close + 1;
      }
      if (isJsxStart(source, index)) {
        const next = readElement(source, index, parent, context);
        index = next ?? index + 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (character === '{') {
      const next = scanCode(source, index + 1, limit, parent, context, true);
      if (next < 0) return -1;
      index = next;
      continue;
    }

    // JSX text: quotes, `//` and backticks here are literal characters.
    index += 1;
  }

  markUnbalanced(parent);
  return -1;
}

/**
 * A JSX-looking `<` in prose (`a < b`) never finds a closing tag; only a real
 * element (a component name or any tag with attributes) makes a lost position
 * an error worth failing on.
 */
function markUnbalanced(element: JsxElement): void {
  if (/^[A-Z]/.test(element.tag) || element.attrs.length > 0) element.validationError = true;
}

/** Read one element (opening tag, attributes, children) starting at `<`. */
function readElement(
  source: string,
  start: number,
  parent: JsxElement | null,
  context: ScanContext,
): number | null {
  const limit = source.length;
  const attrs: JsxAttr[] = [];
  let sawTypeParameterModifier = false;

  let index = start + 1;
  while (index < limit && /\s/.test(source[index])) index += 1;
  const nameStart = index;
  while (index < limit && isNamePart(source[index])) index += 1;
  const tag = source.slice(nameStart, index);
  const node: JsxElement = { tag, attrs, start, parent, children: [] };
  const elementMark = context.elements.length;
  const childMark = parent === null ? 0 : parent.children.length;

  // A node is registered only once its tag closed, so a rejected speculative
  // element leaves no trace in the tree.
  const register = (): void => {
    context.elements.push(node);
    if (parent !== null) parent.children.push(node);
  };
  const rollback = (): null => {
    context.elements.length = elementMark;
    if (parent !== null) parent.children.length = childMark;
    return null;
  };

  // A generic element (`<Select<RemoteTransportType> …>`) carries a type
  // argument list between the tag name and its attributes.
  if (source[index] === '<') {
    let depth = 0;
    while (index < limit) {
      const character = source[index];
      if (character === '{') {
        index = scanCode(source, index + 1, limit, node, context, true);
        continue;
      }
      if (character === '<') depth += 1;
      if (character === '>') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      index += 1;
    }
  }

  while (index < limit) {
    while (index < limit && /\s/.test(source[index])) index += 1;
    if (index >= limit) return rollback();

    const character = source[index];
    // Comments may sit between attributes.
    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index);
      index = newline < 0 || newline >= limit ? limit : newline + 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close < 0) return rollback();
      index = close + 2;
      continue;
    }
    if (character === '/' && source[index + 1] === '>') {
      register();
      return index + 2;
    }
    if (character === '>') {
      // `<T extends X>(…)` and `<T,>(…)` are type-parameter lists on an arrow
      // function, not elements. The speculative read fails to find a matching
      // closing tag and rolls back; `extends` and the `,` reject immediately.
      if (sawTypeParameterModifier) return rollback();
      const end = readChildren(source, index + 1, node, context);
      if (end < 0) return rollback();
      register();
      return end;
    }
    if (character === '{') {
      // Spread attribute: `{...props}`. JSX may be nested in the expression.
      index = scanCode(source, index + 1, limit, node, context, true);
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      index = scanString(source, index, limit, node, context);
      continue;
    }
    if (!isNamePart(character)) {
      // Not a tag after all (a stray `<` in text, a generic arrow): the caller
      // reads the `<` as text. The class-attribute count catches a real drop.
      return rollback();
    }

    const attrStart = index;
    while (index < limit && isNamePart(source[index])) index += 1;
    const name = source.slice(attrStart, index);
    while (index < limit && /\s/.test(source[index])) index += 1;

    if (source[index] !== '=') {
      if (name === 'extends') sawTypeParameterModifier = true;
      attrs.push({ name, raw: '', start: attrStart });
      continue;
    }

    index += 1;
    while (index < limit && /\s/.test(source[index])) index += 1;
    const valueStart = index;

    if (source[index] === '"' || source[index] === "'") {
      index = scanString(source, index, limit, node, context);
    } else if (source[index] === '{') {
      // The expression is scanned as code, so JSX inside it is found with this
      // element as its parent (headerAction, headerEnd, label, render props).
      index = scanCode(source, index + 1, limit, node, context, true);
    } else {
      while (index < limit && isNamePart(source[index])) index += 1;
    }
    attrs.push({ name, raw: source.slice(valueStart, index), start: attrStart });
  }

  return rollback();
}

function parseJsx(source: string): ParseResult {
  const context: ScanContext = { elements: [], truncated: false };
  const consumed = scanCode(source, 0, source.length, null, context, false);
  const lostPlace = context.elements.some((element) => element.validationError === true);
  const complete = consumed >= source.length && !context.truncated && !lostPlace;
  return { elements: context.elements, complete };
}

/** Every string literal inside an attribute value, template parts included. */
function stringLiterals(raw: string): string[] {
  const literals: string[] = [];
  let index = 0;
  while (index < raw.length) {
    const quote = raw[index];
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      index += 1;
      continue;
    }
    let buffer = '';
    index += 1;
    while (index < raw.length) {
      const character = raw[index];
      if (character === '\\') {
        buffer += raw[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (character === quote) {
        index += 1;
        break;
      }
      buffer += character;
      index += 1;
    }
    literals.push(buffer);
  }
  return literals;
}

/** Class tokens an attribute contributes, whether a literal or an expression. */
function classTokens(raw: string): string[] {
  if (raw.length === 0) return [];
  const texts = raw[0] === '"' || raw[0] === "'"
    ? [raw.slice(1, -1)]
    : stringLiterals(raw);
  // `cn('a', cond && 'b')` yields quoted fragments; split on quote characters
  // too so a class inside a nested literal is still one token.
  return texts.flatMap((text) => text.split(/[\s'"`]+/).filter((token) => token.length > 0));
}

/** Utility name with variant prefixes (`@xl:`, `md:`, `hover:`) removed. */
function baseUtility(token: string): string {
  let bracketDepth = 0;
  let lastColon = -1;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === ':' && bracketDepth === 0) lastColon = index;
  }
  return lastColon < 0 ? token : token.slice(lastColon + 1);
}

function isRawWidthToken(token: string): boolean {
  const utility = baseUtility(token);
  if (NEUTRAL_WIDTH_TOKENS[utility] === true) return false;
  return /^w-(\d+(?:\.\d+)?|px|fit|auto|min|max|screen|\[\S+\]|\d+\/\d+)$/.test(utility)
    || /^max-w-/.test(utility)
    || /^min-w-/.test(utility);
}

/** Margin, gap and stack utilities; a zero value is neutral. */
function isSpacingUtility(token: string): boolean {
  const utility = baseUtility(token).replace(/^-/, '');
  const match = /^(m[trblxyse]?|gap(?:-[xy])?|space-[xy])-(.+)$/.exec(utility);
  if (match === null) return false;
  return match[2] !== '0';
}

/** Non-zero `space-y-*` only (the documented section/group stack decision). */
function isVerticalStackUtility(token: string): boolean {
  const utility = baseUtility(token);
  return /^space-y-/.test(utility) && utility !== 'space-y-0';
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}

/** Every class-bearing attribute on the element. */
function classAttrs(element: JsxElement): JsxAttr[] {
  return element.attrs.filter((attr) => CLASS_ATTRS[attr.name] === true);
}

function exceptionReason(file: string, rule: Rule): string | null {
  for (const exception of FILE_EXCEPTIONS) {
    if (!exception.match.test(file)) continue;
    if (exception.rules !== undefined && !exception.rules.includes(rule)) continue;
    return exception.reason;
  }
  return null;
}

/** True when every viewport prefix on the value is a hover-only opacity affordance. */
function isHoverOnlyBreakpointValue(tokens: readonly string[]): boolean {
  return tokens
    .filter((token) => VIEWPORT_BREAKPOINT.test(token))
    .every((token) => HOVER_OPACITY.test(token));
}

/** True when the element renders inside a modal dialog, which sizes to the window. */
function insideDialog(element: JsxElement): boolean {
  let current: JsxElement | null = element;
  while (current !== null) {
    if (DIALOG_CHROME_TAG.test(current.tag)) return true;
    current = current.parent;
  }
  return false;
}

function scanSource(file: string, source: string): Violation[] {
  return scanSourceDetailed(file, source).violations;
}

interface ScanDetail {
  readonly violations: Violation[];
  readonly parse: ParseResult;
}

function scanSourceDetailed(file: string, source: string): ScanDetail {
  const violations: Violation[] = [];
  const report = (offset: number, rule: Rule, detail: string): void => {
    if (exceptionReason(file, rule) !== null) return;
    violations.push({ file, line: lineOf(source, offset), rule, detail });
  };

  const parse = parseJsx(source);

  for (const element of parse.elements) {
    // W: page-local control widths.
    for (const attr of element.attrs) {
      const inspected = attr.name === 'controlClassName'
        || attr.name === 'containerClassName'
        || attr.name === 'triggerClassName'
        || (attr.name === 'className' && CONTROL_TAGS[element.tag] === true);
      if (!inspected) continue;
      for (const token of classTokens(attr.raw)) {
        if (!isRawWidthToken(token)) continue;
        report(
          attr.start,
          'W',
          `<${element.tag}> ${attr.name} carries the raw width "${token}" (use a SETTINGS_WIDTH_* class)`,
        );
      }
    }

    // S: a stack around sections.
    const className = element.attrs.find((attr) => attr.name === 'className');
    if (className !== undefined && element.children.some((child) => child.tag === 'SettingsSection')) {
      for (const token of classTokens(className.raw)) {
        if (!isVerticalStackUtility(token)) continue;
        report(
          className.start,
          'S',
          `<${element.tag}> stacks sections with "${token}" (sections own their rhythm; use SETTINGS_SPACE_* for content groups)`,
        );
      }
    }

    // P: the page layout owns page padding.
    if (element.tag === 'SettingsPageLayout') {
      for (const attr of classAttrs(element)) {
        for (const token of classTokens(attr.raw)) {
          if (!/^(?:p|px|py|ps|pe|pt|pb|pl|pr)-/.test(baseUtility(token))) continue;
          report(attr.start, 'P', `SettingsPageLayout overrides page padding with "${token}"`);
        }
      }
    }

    // B: viewport breakpoints inside pane content. A dialog sizes to the
    // window, so its body is not pane content; control widths inside it (W)
    // still follow the row rules.
    if (!insideDialog(element)) {
      for (const attr of classAttrs(element)) {
        const tokens = classTokens(attr.raw);
        if (isHoverOnlyBreakpointValue(tokens)) continue;
        for (const token of tokens) {
          if (!VIEWPORT_BREAKPOINT.test(token)) continue;
          report(
            attr.start,
            'B',
            `<${element.tag}> ${attr.name} uses the viewport breakpoint "${token}" in pane content (use @xl:/@3xl:)`,
          );
        }
      }
    }

    // N: the fixed number width belongs to a stepper row.
    for (const attr of classAttrs(element)) {
      if (!attr.raw.includes(NUMBER_WIDTH_CLASS)) continue;
      let ancestor = element.parent;
      let inStepperRow = false;
      while (ancestor !== null) {
        const stepper = ancestor.attrs.some((candidate) => candidate.raw.includes(NUMBER_STEPPER_ROW_CLASS));
        if (stepper) {
          inStepperRow = true;
          break;
        }
        if (ROW_BOUNDARY_TAGS[ancestor.tag] === true) break;
        ancestor = ancestor.parent;
      }
      if (!inStepperRow) {
        report(
          attr.start,
          'N',
          `<${element.tag}> applies ${NUMBER_WIDTH_CLASS} outside a ${NUMBER_STEPPER_ROW_CLASS} row`,
        );
      }
    }

    // G: spacing utilities where a named class owns the decision.
    const controlSpacing = element.tag !== '' && CONTROL_TAGS[element.tag] === true;
    const rowSpacing = ROW_TAGS[element.tag] === true;
    const contentStack = CONTENT_STACK_TAGS[element.tag] === true;
    for (const attr of classAttrs(element)) {
      const checksSpacing = (attr.name === 'className' && controlSpacing)
        || (rowSpacing && (attr.name === 'className' || attr.name === 'controlClassName'));
      const checksStack = contentStack && attr.name === 'contentClassName';
      if (!checksSpacing && !checksStack) continue;
      for (const token of classTokens(attr.raw)) {
        if (checksStack) {
          if (!isVerticalStackUtility(token)) continue;
          report(
            attr.start,
            'G',
            `<${element.tag}> ${attr.name} sets its own stack with "${token}" (use SETTINGS_SPACE_SECTION_CLASS / SETTINGS_SPACE_ROW_CLASS / SETTINGS_SPACE_CHECKBOX_CLASS)`,
          );
          continue;
        }
        if (!isSpacingUtility(token)) continue;
        report(
          attr.start,
          'G',
          `<${element.tag}> ${attr.name} carries the spacing utility "${token}" (row and section spacing come from the shared primitives)`,
        );
      }
    }
  }

  return { violations, parse };
}

const EXCLUDED_SOURCES: Record<string, true> = {
  'shared/SettingsSection.tsx': true,
};

const sectionPath = (file: string): string => relative(SECTIONS_ROOT, file).split(sep).join('/');

function walkSources(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkSources(full, files);
      continue;
    }
    if (!entry.name.endsWith('.tsx') || entry.name.endsWith('.test.tsx')) continue;
    if (EXCLUDED_SOURCES[sectionPath(full)] === true) continue;
    files.push(full);
  }
  return files;
}

interface FileScan {
  readonly file: string;
  readonly fullPath: string;
  readonly detail: ScanDetail;
}

function scanSections(): FileScan[] {
  const sectionFiles = walkSources(SECTIONS_ROOT).map((fullPath) => {
    const file = sectionPath(fullPath);
    return {
      file,
      fullPath,
      detail: scanSourceDetailed(file, readFileSync(fullPath, 'utf8')),
    };
  });
  const viewFiles = PANE_VIEW_SOURCES.map((file) => {
    const fullPath = join(COMPONENTS_ROOT, file);
    return {
      file,
      fullPath,
      detail: scanSourceDetailed(file, readFileSync(fullPath, 'utf8')),
    };
  });
  return [...sectionFiles, ...viewFiles];
}

function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((violation) => `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`)
    .sort()
    .join('\n');
}

describe('settings layout guard', () => {
  test('detects a raw width on a control and a section stack on a page', () => {
    const source = `
      const page = (
        <SettingsPageLayout title="OMP">
          <div className="space-y-6">
            <SettingsSection title="A">
              <SettingsFieldRow label="Model">
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              </SettingsFieldRow>
              <SettingsFieldRow label="Budget" controlClassName="max-w-md">
                <Input className="h-7 w-44" />
                <ModelSelector className="w-48" />
              </SettingsFieldRow>
            </SettingsSection>
          </div>
        </SettingsPageLayout>
      );
    `;
    const violations = scanSource('fixture/LayoutPage.tsx', source);
    expect(violations.map((violation) => violation.rule).sort()).toEqual(['S', 'W', 'W', 'W', 'W']);
    expect(violations.some((violation) => violation.detail.includes('"w-48"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"max-w-md"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"w-44"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"space-y-6"'))).toBe(true);
  });

  test('accepts the named classes and layout-neutral widths', () => {
    const source = `
      const page = (
        <SettingsPageLayout title="OMP">
          <div className="space-y-0">
            <SettingsSection title="A">
              <div className={SETTINGS_SPACE_ROW_CLASS}>
                <SettingsFieldRow label="Model">
                  <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}><SelectValue /></SelectTrigger>
                </SettingsFieldRow>
                <SettingsFieldRow label="Budget">
                  <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                    <NumberInput className={SETTINGS_WIDTH_NUMBER_CLASS} />
                    <span className={SETTINGS_NUMBER_UNIT_CLASS}>s</span>
                  </div>
                </SettingsFieldRow>
                <SettingsFieldRow label="Notes" controlClassName="w-full max-w-none">
                  <Textarea className="min-w-0" />
                </SettingsFieldRow>
              </div>
            </SettingsSection>
          </div>
        </SettingsPageLayout>
      );
    `;
    expect(formatViolations(scanSource('fixture/CleanPage.tsx', source))).toBe('');
  });

  test('detects bare number width, page padding and viewport breakpoints', () => {
    const source = `
      const page = (
        <SettingsPageLayout className="px-4 @xl:px-6" title="Git">
          <SettingsSection title="A">
            <SettingsFieldRow label="Limit">
              <NumberInput className={SETTINGS_WIDTH_NUMBER_CLASS} />
            </SettingsFieldRow>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input className="h-7 md:max-w-sm" />
            </div>
            <Button className="md:opacity-0 md:group-hover:opacity-100" />
          </SettingsSection>
        </SettingsPageLayout>
      );
    `;
    const violations = scanSource('fixture/OverridesPage.tsx', source);
    expect(violations.map((violation) => violation.rule).sort()).toEqual(['B', 'B', 'N', 'P', 'P', 'W']);
    expect(violations.every((violation) => !violation.detail.includes('md:opacity-0'))).toBe(true);
  });

  test('detects spacing utilities on controls, row primitives and section content', () => {
    const source = `
      <SettingsPageLayout title="A">
        <SettingsSection title="B" contentClassName="space-y-4">
          <SettingsFieldRow label="C" className="mt-2" controlClassName="gap-3">
            <Input className="mb-4 w-full" />
            <SelectTrigger className="space-x-2" />
          </SettingsFieldRow>
          <SettingsStackedField label="D" controlClassName="mx-auto" />
          <SettingsCheckboxRow label="E" className="my-3" />
          <SettingsControlGroup title="F" contentClassName="space-y-6" />
          <div className="space-y-4 gap-2 mt-6">
            <Input className="m-0 p-0" />
          </div>
        </SettingsSection>
      </SettingsPageLayout>
    `;
    const violations = scanSource('fixture/SpacingPage.tsx', source);
    const details = violations.map((violation) => `${violation.rule}:${violation.detail}`);
    // Section content stack + field-row className/controlClassName + input
    // margin + trigger stack + stacked-field control + checkbox margin +
    // control-group content stack.
    expect(details.length).toBe(8);
    expect(details.every((detail) => detail.startsWith('G:'))).toBe(true);
    for (const token of ['"space-y-4"', '"mt-2"', '"gap-3"', '"mb-4"', '"space-x-2"', '"mx-auto"', '"my-3"', '"space-y-6"']) {
      expect(details.some((detail) => detail.includes(token))).toBe(true);
    }
    // A generic wrapper keeps its own gap stack; `m-0` and `p-0` are neutral.
    expect(details.some((detail) => detail.includes('<div>'))).toBe(false);
  });

  test('exempts modal chrome, sidebars and the project dialog shell', () => {
    const dialog = `
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="sm:text-start" />
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row" />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    `;
    expect(formatViolations(scanSource('agents/AgentsDialog.tsx', dialog))).toBe('');
    expect(formatViolations(scanSource('agents/AgentsSidebar.tsx', '<div className="h-6 w-6 md:opacity-0" />'))).toBe('');
    expect(formatViolations(scanSource('projects/ProjectSettingsPanel.tsx', '<div className="px-4 sm:px-6" />'))).toBe('');

    // A dialog body sizes to the window, so its viewport breakpoints pass, but
    // a control width inside it still follows the row rules.
    const nestedRow = `
      <Dialog open>
        <DialogContent className="sm:max-w-4xl">
          <SettingsFieldRow label="Limit">
            <Input className="h-7 md:max-w-sm" />
          </SettingsFieldRow>
        </DialogContent>
      </Dialog>
    `;
    const nested = scanSource('fixture/NestedSettings.tsx', nestedRow);
    expect(nested.map((violation) => violation.rule).sort()).toEqual(['W']);
  });

  test('scans JSX nested in attribute expressions', () => {
    const source = `
      <SettingsSection
        title="A"
        headerAction={(<Input className="w-44" />)}
        headerEnd={<SelectTrigger className="max-w-[10rem]" />}
      >
        <SettingsFieldRow label="B" />
      </SettingsSection>
    `;
    const violations = scanSource('fixture/HeaderAction.tsx', source);
    expect(violations.map((violation) => violation.rule).sort()).toEqual(['W', 'W']);
    expect(violations.some((violation) => violation.detail.includes('"w-44"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"max-w-[10rem]"'))).toBe(true);
  });

  test('lexes regex literals and keeps scanning after them', () => {
    // The quote and backtick inside the character class used to be read as a
    // string, swallowing the rest of the file.
    const source = `
      const normalize = (value: string) => value.replace(/[^!#$%&'*+._\`|~0-9A-Za-z-]/g, '');
      const division = total / count;
      export const Page = () => (
        <SettingsSection title="A">
          <Input className="w-48" />
        </SettingsSection>
      );
    `;
    const violations = scanSource('fixture/RegexPage.tsx', source);
    expect(violations.map((violation) => violation.rule)).toEqual(['W']);
    expect(scanSourceDetailed('fixture/RegexPage.tsx', source).parse.complete).toBe(true);
  });

  test('scans every file to the end: appended and mid-file violations are found', () => {
    // Each scanned file with a control must report a raw width appended at
    // EOF and one injected on its middle control. A region the lexer skips
    // cannot satisfy both, whichever part of the file it is.
    const failures: string[] = [];
    let probed = 0;

    for (const { file, fullPath } of scanSections()) {
      // A file-level exception (navigation chrome) legitimately hides the hit.
      if (exceptionReason(file, 'W') !== null) continue;
      const source = readFileSync(fullPath, 'utf8');
      const { elements } = parseJsx(source);
      const controls = elements.filter((element) => CONTROL_TAGS[element.tag] === true);
      if (controls.length === 0) continue;
      probed += 1;

      const appended = `${source}\nconst ProbeAppended = () => <Input className="w-48" />;\nconst ProbeStack = () => <SettingsSection contentClassName="space-y-4" />;\n`;
      const appendedHits = scanSource(file, appended);
      if (!appendedHits.some((violation) => violation.rule === 'W' && violation.detail.includes('"w-48"'))) {
        failures.push(`${file}: appended element not scanned`);
      }
      if (!appendedHits.some((violation) => violation.rule === 'G' && violation.detail.includes('"space-y-4"'))) {
        failures.push(`${file}: appended section stack not scanned`);
      }

      // Skip a generic element (`<Select<Preset>`): its type list sits where
      // the probe would insert attributes.
      const plain = controls.filter((element) => source[element.start + 1 + element.tag.length] !== '<');
      if (plain.length === 0) continue;
      const target = plain[Math.floor(plain.length / 2)];
      const at = target.start + 1 + target.tag.length;
      const mutated = `${source.slice(0, at)} className="w-48"${source.slice(at)}`;
      if (!scanSource(file, mutated).some((violation) => violation.rule === 'W' && violation.detail.includes('"w-48"'))) {
        failures.push(`${file}: mid-file control not scanned`);
      }
    }

    // The probe must actually cover the tree, not pass by finding no files.
    expect(probed).toBeGreaterThan(40);
    expect(failures.sort()).toEqual([]);
  });

  test('lexes templates, comments and arrow generics without losing JSX', () => {
    const source = `
      /* A doc comment may show JSX: <Input className="w-99" /> must not count. */
      // Nor may this line: <Input className="w-98" />
      const label = \`</div> <Input className="w-97" /> \${value}\`;
      const render = <Item extends Row>(row: Item) => <span>{row.id}</span>;
      const narrow = <T,>(value: T): T => value;
      export const Page = () => (
        <SettingsSection title="A">
          <Input className="w-96" />
        </SettingsSection>
      );
    `;
    const detail = scanSourceDetailed('fixture/HolesPage.tsx', source);
    expect(detail.parse.complete).toBe(true);
    // Only the real element's width counts; the doc comment, the line comment
    // and the template literal each name a width too, and must not.
    expect(detail.violations).toHaveLength(1);
    expect(detail.violations[0].detail).toContain('"w-96"');
  });

  test('scans settings-pane views outside components/sections', () => {
    const scanned = new Set(scanSections().map((entry) => entry.file));
    for (const view of PANE_VIEW_SOURCES) {
      expect(scanned.has(view)).toBe(true);
    }
    const rawSelect = scanSource(
      'views/usage/UsageStatsView.tsx',
      '<SelectTrigger className="w-fit min-w-[140px] max-w-64" />',
    );
    expect(rawSelect.map((violation) => violation.rule)).toEqual(['W', 'W', 'W']);

    const cappedTabs = scanSource(
      'openchamber/OmpSettingsPage.tsx',
      '<SortableTabsStrip className="h-8 max-w-[28rem]" />',
    );
    expect(cappedTabs.map((violation) => violation.rule)).toEqual(['W']);

    const intrinsicTabs = scanSource(
      'openchamber/OmpSettingsPage.tsx',
      '<SortableTabsStrip className="flex-none max-w-full" />',
    );
    expect(intrinsicTabs).toEqual([]);
  });

  test('the lexer reaches the end of every settings source file', () => {
    const truncated = scanSections()
      .filter(({ detail }) => !detail.parse.complete)
      .map(({ file }) => `${file}: parse did not reach EOF in a balanced state`);
    expect(truncated.sort()).toEqual([]);
  });

  test('finds no ad-hoc layout override under components/sections or settings-pane views', () => {
    const violations = scanSections().flatMap((entry) => entry.detail.violations);
    expect(formatViolations(violations)).toBe('');
  });
});
