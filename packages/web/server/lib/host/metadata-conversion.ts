import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { JsonObject } from '../shared/json-values.js';
import {
  MetadataCorruptError,
  MetadataReadError,
  MetadataWriteError,
  readJsonObject,
  withTransaction,
  type HostMetadataError,
} from './metadata-sqlite.js';

const ConversionReceiptSchema = z.object({ completed: z.number() });
const ErrorCodeSchema = z.object({ code: z.string() });

export interface LegacyMetadataConversionOptions<Entry> {
  db: DatabaseSync;
  dataDir: string;
  fileName: string;
  parse: (parsed: JsonObject) => { entries: Entry; errors: Record<string, string> };
  insert: (entries: Entry) => void;
  fsPromises?: typeof fs.promises;
  nodePath?: typeof path;
}

export interface LegacyMetadataConversionResult {
  status: 'complete' | 'missing' | 'corrupt' | 'partial' | 'failed';
  errors: Record<string, string>;
  error?: HostMetadataError;
}

export interface LegacyMetadataConversion {
  convert: () => Promise<LegacyMetadataConversionResult>;
  sourcePath: string;
}

export const createLegacyMetadataConversion = <Entry>({
  db,
  dataDir,
  fileName,
  parse,
  insert,
  fsPromises = fs.promises,
  nodePath = path,
}: LegacyMetadataConversionOptions<Entry>): LegacyMetadataConversion => {
  let pending: Promise<LegacyMetadataConversionResult> | undefined;
  const sourcePath = nodePath.join(dataDir, fileName);
  const convert = (): Promise<LegacyMetadataConversionResult> => {
    if (pending) return pending;
    pending = (async (): Promise<LegacyMetadataConversionResult> => {
      try {
        const rawReceipt = db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(fileName);
        const receipt = ConversionReceiptSchema.safeParse(rawReceipt);
        if (receipt.success && receipt.data.completed === 1) return { status: 'complete', errors: {} };
      } catch (error) {
        return { status: 'failed', errors: {}, error: new MetadataReadError('Could not read operational conversion receipt', error) };
      }
      let raw: string;
      try { raw = await fsPromises.readFile(sourcePath, 'utf8'); }
      catch (error) {
        const parsedError = ErrorCodeSchema.safeParse(error);
        if (parsedError.success && parsedError.data.code === 'ENOENT') return { status: 'missing', errors: {} };
        return { status: 'failed', errors: {}, error: new MetadataReadError(`Could not read ${fileName}`, error) };
      }
      let parsed: { entries: Entry; errors: Record<string, string> };
      try { parsed = parse(readJsonObject(raw, fileName)); }
      catch (error) {
        return {
          status: 'corrupt',
          errors: {},
          error: error instanceof MetadataCorruptError ? error : new MetadataCorruptError(`${fileName} is corrupt`, error),
        };
      }
      try {
        withTransaction(db, () => {
          insert(parsed.entries);
          if (Object.keys(parsed.errors).length === 0) {
            db.prepare('INSERT INTO metadata_conversion (source, completed) VALUES (?, 1) ON CONFLICT(source) DO UPDATE SET completed = 1').run(fileName);
          }
        });
      } catch (error) {
        return { status: 'failed', errors: parsed.errors, error: new MetadataWriteError(`Could not convert ${fileName}`, error) };
      }
      return { status: Object.keys(parsed.errors).length === 0 ? 'complete' : 'partial', errors: parsed.errors };
    })();
    return pending;
  };
  return { convert, sourcePath };
};
