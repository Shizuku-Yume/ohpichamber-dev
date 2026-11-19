import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuration = JSON.parse(fs.readFileSync(path.join(electronRoot, 'package.json'), 'utf8'));

test('Windows packaging includes the Agent link cleanup hooks', () => {
  assert.equal(configuration.build.nsis.include, 'resources/installer.nsh');
  assert.match(fs.readFileSync(path.join(electronRoot, configuration.build.nsis.include), 'utf8'), /nsis-agent-links\.nsh/);
  const hooks = fs.readFileSync(path.join(electronRoot, 'resources/nsis-agent-links.nsh'), 'utf8');
  assert.doesNotMatch(hooks, /!macro customInit/);
  assert.match(hooks, /!macro customCheckAppRunning\s+!insertmacro IS_POWERSHELL_AVAILABLE\s+!insertmacro _CHECK_APP_RUNNING\s+Call CleanupAgentLinks/);
});

test('compiled installer and uninstaller hooks unlink only Agent directory reparse points', {
  skip: process.platform !== 'win32',
}, t => {
  const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache/nsis-3.0.4.1');
  if (!fs.existsSync(cache)) return t.skip('NSIS compiler cache is populated by Windows packaging');
  const compiler = fs.readdirSync(cache).map(name => path.join(cache, name, 'makensis.exe')).find(file => fs.existsSync(file));
  assert.ok(compiler, 'Build the Windows package first to populate the electron-builder NSIS cache');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nsis-agent-links-'));
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
  const includes = path.join(path.dirname(builderRequire.resolve('app-builder-lib/package.json')), 'templates/nsis/include');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const uninstall of [false, true]) {
    const executable = path.join(directory, uninstall ? 'uninstall-builder.exe' : 'cleanup.exe');
    const script = path.join(directory, 'cleanup.nsi');
    fs.writeFileSync(script, `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${executable}"
!addincludedir "${includes}"
!macro IS_POWERSHELL_AVAILABLE
!macroend
!macro _CHECK_APP_RUNNING
  IfFileExists "$INSTDIR\\cancel-check" 0 +2
  Quit
!macroend
${uninstall ? '!define BUILD_UNINSTALLER' : ''}
!include "${path.join(electronRoot, 'resources/installer.nsh')}"
Section
${uninstall ? 'WriteUninstaller "$EXEDIR\\cleanup-uninstall.exe"' : '!insertmacro customCheckAppRunning'}
SectionEnd
${uninstall ? 'Section "un.Cleanup"\n!insertmacro customUnInstall\nSectionEnd' : ''}
`);
    execFileSync(compiler, ['/V2', script]);
    if (uninstall) execFileSync(executable);
    const run = root => execFileSync(uninstall ? path.join(directory, 'cleanup-uninstall.exe') : executable,
      uninstall ? ['/S', `_?=${root}`] : ['/S', `/D=${root}`], { windowsVerbatimArguments: true });
    const root = path.join(directory, uninstall ? 'uninstall root' : 'install root');
    const agent = path.join(root, 'resources/agent-runtime');
    const target = path.join(agent, 'packages/1');
    const external = path.join(directory, 'outside');
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(external, { recursive: true });
    fs.writeFileSync(path.join(target, 'keep.txt'), 'payload');
    fs.writeFileSync(path.join(external, 'keep.txt'), 'outside');
    fs.symlinkSync(target, path.join(agent, 'dependency'), 'junction');
    fs.symlinkSync(external, path.join(agent, 'external'), 'junction');
    fs.symlinkSync(path.join(agent, 'missing'), path.join(agent, 'dangling'), 'junction');
    fs.symlinkSync(external, path.join(external, 'untouched'), 'junction');
    fs.symlinkSync(path.join(target, 'keep.txt'), path.join(agent, 'file-link'), 'file');
    if (!uninstall) {
      const cancel = path.join(root, 'cancel-check');
      fs.writeFileSync(cancel, 'cancel');
      assert.throws(() => run(root), error => error.status === 2);
      assert.ok(fs.lstatSync(path.join(agent, 'dependency')).isSymbolicLink());
      assert.equal(fs.readFileSync(path.join(agent, 'dependency/keep.txt'), 'utf8'), 'payload');
      fs.unlinkSync(cancel);
    }
    run(root);
    for (const name of ['dependency', 'external', 'dangling']) {
      assert.throws(() => fs.lstatSync(path.join(agent, name)), { code: 'ENOENT' }, name);
    }
    assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'payload');
    assert.equal(fs.readFileSync(path.join(external, 'keep.txt'), 'utf8'), 'outside');
    assert.ok(fs.lstatSync(path.join(external, 'untouched')).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(agent, 'file-link')).isSymbolicLink());
    run(root);
    run(path.join(directory, 'absent'));
    const redirected = path.join(directory, uninstall ? 'uninstall redirected' : 'install redirected');
    fs.mkdirSync(redirected, { recursive: true });
    fs.symlinkSync(external, path.join(redirected, 'resources'), 'junction');
    run(redirected);
    assert.ok(fs.lstatSync(path.join(external, 'untouched')).isSymbolicLink());
    fs.unlinkSync(path.join(redirected, 'resources'));
    fs.mkdirSync(path.join(redirected, 'resources'));
    fs.symlinkSync(external, path.join(redirected, 'resources/agent-runtime'), 'junction');
    run(redirected);
    assert.ok(fs.lstatSync(path.join(external, 'untouched')).isSymbolicLink());
    fs.unlinkSync(path.join(external, 'untouched'));
  }
});
