import { describe, expect, it } from 'vitest';
import { createSshPassphraseStore } from './ssh-passphrases.js';

describe('Host SSH passphrase storage', () => {
  it('creates a Host-owned entry without activating provider credentials', async () => {
    const entries = [];
    const store = createSshPassphraseStore({
      list: async () => entries,
      create: async (entry) => { entries.push(entry); },
      remove: async () => {},
    });
    await store.create('ssh_one', 'fixture-passphrase');
    expect(entries).toEqual([{
      id: 'ssh_one', integrationID: 'openchamber-git-ssh', label: 'Git SSH key',
      value: { type: 'key', key: 'fixture-passphrase' }, activate: false,
    }]);
    expect(await store.read('ssh_one')).toBe('fixture-passphrase');
  });

  it('reads and removes exact SSH credentials independently of provider accounts', async () => {
    const entries = [
      { id: 'provider', integrationID: 'openai', value: { type: 'key', key: 'provider-secret' } },
      { id: 'ssh_one', integrationID: 'openchamber-git-ssh', value: { type: 'key', key: 'first' } },
      { id: 'ssh_two', integrationID: 'openchamber-git-ssh', value: { type: 'key', key: 'second' } },
    ];
    const store = createSshPassphraseStore({ list: async () => entries,
      remove: async (id) => { entries.splice(entries.findIndex((entry) => entry.id === id), 1); } });
    expect(await store.read('ssh_one')).toBe('first');
    expect(await store.read('ssh_two')).toBe('second');
    expect(await store.read('provider')).toBeNull();
    await store.remove('provider');
    await store.remove('ssh_one');
    expect(entries.map((entry) => entry.id)).toEqual(['provider', 'ssh_two']);
    expect(await store.read('ssh_one')).toBeNull();
  });

  it('does not turn a Host read failure into a missing credential', async () => {
    const store = createSshPassphraseStore({ list: async () => { throw new Error('offline'); } });
    await expect(store.read('cred_one')).rejects.toThrow('offline');
  });

  it('treats an empty source or an absent passphrase as unavailable', async () => {
    const empty = createSshPassphraseStore({ list: async () => [] });
    expect(await empty.read('missing')).toBeNull();
    const missingPassphrase = createSshPassphraseStore({ list: async () => [{
      id: 'missing', integrationID: 'openchamber-git-ssh', value: { type: 'key' },
    }] });
    expect(await missingPassphrase.read('missing')).toBeNull();
  });
});
