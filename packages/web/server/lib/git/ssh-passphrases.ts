interface SshPassphraseEntry {
  id: string;
  integrationID: string;
  value: { type: string; key?: string };
}

interface SshPassphraseSource {
  create(entry: SshPassphraseEntry & { label: string; activate: false }): Promise<void>;
  list(): Promise<readonly SshPassphraseEntry[]>;
  remove(id: string): Promise<void>;
}

const INTEGRATION_ID = 'openchamber-git-ssh';

export function createSshPassphraseStore(source: SshPassphraseSource) {
  return {
    create: async (id: string, passphrase: string) => {
      await source.create({ id, integrationID: INTEGRATION_ID, label: 'Git SSH key',
        value: { type: 'key', key: passphrase }, activate: false });
    },
    read: async (id: string) => {
      const entry = (await source.list()).find((item) => item.id === id && item.integrationID === INTEGRATION_ID);
      if (!entry || entry.value.type !== 'key' || typeof entry.value.key !== 'string') return null;
      return entry.value.key;
    },
    remove: async (id: string) => {
      const entry = (await source.list()).find((item) => item.id === id && item.integrationID === INTEGRATION_ID);
      if (entry) await source.remove(id);
    },
  };
}
