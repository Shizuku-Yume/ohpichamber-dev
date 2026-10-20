import { describe, expect, test } from 'bun:test';
import type { ProjectEntry } from '@/lib/api/types';
import { resolveSettingsDirectory } from './useSettingsDirectory';

const project = (id: string, path: string): ProjectEntry => ({ id, path } as ProjectEntry);
const chatsRoot = '/home/fixture/.openchamber/chats';
const projects = [
  project('a', '/workspace/alpha'),
  project('b', '/workspace/beta'),
];

describe('resolveSettingsDirectory', () => {
  test('follows the active project until Settings picks one', () => {
    expect(resolveSettingsDirectory(null, projects, 'b', chatsRoot)).toBe('/workspace/beta');
  });

  test('keeps the Settings pick even when the app is on another project', () => {
    // The whole point: browsing another project's configuration must not depend
    // on moving the app to it.
    expect(resolveSettingsDirectory('/workspace/alpha', projects, 'b', chatsRoot)).toBe('/workspace/alpha');
  });

  test('falls back to the active project when the picked one is gone', () => {
    expect(resolveSettingsDirectory('/workspace/removed', projects, 'b', chatsRoot)).toBe('/workspace/beta');
  });

  test('uses the Host chats root when the selected project is gone and no projects remain', () => {
    expect(resolveSettingsDirectory('/workspace/alpha', [], null, chatsRoot)).toBe(chatsRoot);
  });

  test('resolves to nothing when there are no projects and the Host has not named a chats root', () => {
    expect(resolveSettingsDirectory(null, [], null, null)).toBe(null);
  });
});
