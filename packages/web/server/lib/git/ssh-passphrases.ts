import { z } from 'zod';

const SshPassphraseValueSchema = z.object({ type: z.literal('key'), key: z.string() });

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
      if (!entry) return null;
      const value = SshPassphraseValueSchema.safeParse(entry.value);
      return value.success ? value.data.key : null;
    },
    remove: async (id: string) => {
      const entry = (await source.list()).find((item) => item.id === id && item.integrationID === INTEGRATION_ID);
      if (entry) await source.remove(id);
    },
  };
}
