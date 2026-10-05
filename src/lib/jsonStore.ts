import fs from 'node:fs';
import path from 'node:path';

/** Where small JSON data files live (theme, warnings). Override with DATA_DIR. */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/** Tiny, dependency-free JSON file store with atomic writes. */
export class JsonStore<T> {
  private readonly file: string;

  constructor(name: string, private readonly fallback: () => T) {
    this.file = path.join(DATA_DIR, name);
  }

  read(): T {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as T;
    } catch {
      return this.fallback();
    }
  }

  write(data: T): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`❌ [JsonStore] Failed to write ${this.file}:`, err);
    }
  }

  remove(): void {
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}
