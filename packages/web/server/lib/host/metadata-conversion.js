import fs from 'node:fs';
import path from 'node:path';
import { MetadataCorruptError, MetadataReadError, MetadataWriteError, readJsonObject, withTransaction } from './metadata-sqlite.js';

/** Conversion owns only explicitly named operational sidecar files, never transcripts. */
export const createLegacyMetadataConversion = ({ db, dataDir, fileName, parse, insert, fsPromises = fs.promises, nodePath = path }) => {
  let pending;
  const sourcePath = nodePath.join(dataDir, fileName);
  const convert = () => {
    if (pending) return pending;
    pending = (async () => {
      try {
        const receipt = db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(fileName);
        if (receipt?.completed === 1) return { status: 'complete', errors: {} };
      } catch (error) {
        return { status: 'failed', errors: {}, error: new MetadataReadError('Could not read operational conversion receipt', error) };
      }
      let raw;
      try { raw = await fsPromises.readFile(sourcePath, 'utf8'); }
      catch (error) {
        if (error?.code === 'ENOENT') return { status: 'missing', errors: {} };
        return { status: 'failed', errors: {}, error: new MetadataReadError(`Could not read ${fileName}`, error) };
      }
      let parsed;
      try { parsed = parse(readJsonObject(raw, fileName)); }
      catch (error) {
        return { status: 'corrupt', errors: {}, error: error instanceof MetadataCorruptError ? error : new MetadataCorruptError(`${fileName} is corrupt`, error) };
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
      // Source bytes remain intact even after a successful conversion. The durable
      // receipt, committed with its rows, prevents stale replay after restart.
      return { status: Object.keys(parsed.errors).length === 0 ? 'complete' : 'partial', errors: parsed.errors };
    })();
    return pending;
  };
  return { convert, sourcePath };
};
