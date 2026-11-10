/**
 * Regression guard for https://github.com/openchamber/openchamber/issues/2644
 *
 * Escape while focus is inside the terminal must reach the PTY (e.g. Vim
 * Normal mode). The desktop context zones no longer close on Escape at all;
 * the mobile drawer still does, except from its terminal tab.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
<<<<<<< HEAD
const contextPanelSource = readFileSync(join(__dirname, '..', 'ContextPanel.tsx'), 'utf-8');
const zoneEscapeSource = readFileSync(join(__dirname, '..', 'zoneEscape.ts'), 'utf-8');
=======
>>>>>>> bc50ba56a
const mobileWorkspaceDrawerSource = readFileSync(
  join(__dirname, '..', '..', '..', 'apps', 'MobileWorkspaceDrawer.tsx'),
  'utf-8',
);

<<<<<<< HEAD
describe('issue #2644: Escape in terminal must not close the context panel', () => {
  test('the context panel captures Escape at the panel level', () => {
    expect(contextPanelSource).toContain('onKeyDownCapture={handlePanelKeyDownCapture}');
  });

  test('the zone frame asks the shared Escape helper, which skips closing inside the terminal', () => {
    expect(contextPanelSource).toContain('closeZoneOnEscape(event, isOpen, handleClose)');
    expect(zoneEscapeSource).toContain("event.key !== 'Escape'");
    expect(zoneEscapeSource).toContain('isTerminalEventTarget(event.target)');
    expect(zoneEscapeSource).toContain('event.preventDefault()');
    expect(zoneEscapeSource).toContain('event.stopPropagation()');

    // The guard returns before preventDefault/stopPropagation so the terminal
    // input's bubble-phase listener can forward Escape to the PTY.
    const guardIndex = zoneEscapeSource.indexOf('isTerminalEventTarget(event.target)');
    const preventIndex = zoneEscapeSource.indexOf('event.preventDefault()');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(preventIndex).toBeGreaterThan(guardIndex);
  });

  test('the Escape helper imports the shared terminal, editor and IME guards', () => {
    expect(zoneEscapeSource).toContain("from '@/lib/terminalFocus'");
    expect(zoneEscapeSource).toContain('isTerminalEventTarget');
    expect(zoneEscapeSource).toContain("from '@/lib/editorFocus'");
    expect(zoneEscapeSource).toContain("from '@/lib/ime'");
  });

=======
describe('issue #2644: Escape in terminal must not close the panel around it', () => {
>>>>>>> bc50ba56a
  test('mobile drawer keeps its terminal Escape exception', () => {
    const handlerStart = mobileWorkspaceDrawerSource.indexOf("if (event.key !== 'Escape'");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = mobileWorkspaceDrawerSource.slice(handlerStart, handlerStart + 300);
    // The terminal tab returns before the drawer closes on Escape.
    expect(handler).toContain("tabRef.current === 'terminal') return");
    expect(handler).toContain('onCloseRef.current()');
  });
});
