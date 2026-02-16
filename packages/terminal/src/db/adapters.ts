import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { DatabaseEntity } from './schema';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  query<T extends DatabaseEntity>(collection: string, filter?: Partial<T>): Promise<T[]>;
  insert<T extends DatabaseEntity>(collection: string, record: T): Promise<T>;
  update<T extends DatabaseEntity>(collection: string, id: string, updates: Partial<T>): Promise<T | null>;
  delete(collection: string, id: string): Promise<boolean>;
}

/**
 * FileAdapter - JSON file-based storage (default, always works)
 */
export class FileAdapter implements DatabaseAdapter {
  private connected = false;
  private dbPath: string;

  constructor(path?: string) {
    this.dbPath = path || join(homedir(), '.wabisabi', 'db');
  }

  async connect(): Promise<void> {
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private getFilePath(collection: string): string {
    return join(this.dbPath, `${collection}.json`);
  }

  private readCollection<T>(collection: string): T[] {
    const filePath = this.getFilePath(collection);
    if (!existsSync(filePath)) return [];
    try {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private writeCollection<T>(collection: string, data: T[]): void {
    const filePath = this.getFilePath(collection);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async query<T extends DatabaseEntity>(collection: string, filter?: Partial<T>): Promise<T[]> {
    const records = this.readCollection<T>(collection);
    if (!filter) return records;

    return records.filter(record => {
      return Object.entries(filter).every(([key, value]) => {
        return record[key as keyof T] === value;
      });
    });
  }

  async insert<T extends DatabaseEntity>(collection: string, record: T): Promise<T> {
    const records = this.readCollection<T>(collection);
    records.push(record);
    this.writeCollection(collection, records);
    return record;
  }

  async update<T extends DatabaseEntity>(collection: string, id: string, updates: Partial<T>): Promise<T | null> {
    const records = this.readCollection<T>(collection);
    const index = records.findIndex((r: any) => r.id === id);
    if (index === -1) return null;

    records[index] = { ...records[index], ...updates };
    this.writeCollection(collection, records);
    return records[index];
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const records = this.readCollection<any>(collection);
    const filtered = records.filter((r: any) => r.id !== id);
    if (filtered.length === records.length) return false;

    this.writeCollection(collection, filtered);
    return true;
  }
}

/**
 * SqliteAdapter - Uses bun:sqlite if available, falls back to FileAdapter
 */
export class SqliteAdapter implements DatabaseAdapter {
  private db: any = null;
  private fallback: FileAdapter;

  constructor(path?: string) {
    const dbPath = path || join(homedir(), '.wabisabi', 'db', 'wabisabi.sqlite');
    this.fallback = new FileAdapter();

    try {
      // Try to use bun:sqlite
      const { Database } = require('bun:sqlite');
      this.db = new Database(dbPath);
      this.initTables();
    } catch {
      // Fallback to FileAdapter if bun:sqlite unavailable
      this.db = null;
    }
  }

  private initTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      )
    `);
  }

  async connect(): Promise<void> {
    if (this.db) return;
    await this.fallback.connect();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    } else {
      await this.fallback.disconnect();
    }
  }

  isConnected(): boolean {
    return this.db !== null || this.fallback.isConnected();
  }

  async query<T extends DatabaseEntity>(collection: string, filter?: Partial<T>): Promise<T[]> {
    if (!this.db) return this.fallback.query(collection, filter);

    const stmt = this.db.prepare('SELECT data FROM records WHERE collection = ?');
    const rows = stmt.all(collection);
    let records = rows.map((row: any) => JSON.parse(row.data)) as T[];

    if (filter) {
      records = records.filter(record => {
        return Object.entries(filter).every(([key, value]) => {
          return record[key as keyof T] === value;
        });
      });
    }

    return records;
  }

  async insert<T extends DatabaseEntity>(collection: string, record: T): Promise<T> {
    if (!this.db) return this.fallback.insert(collection, record);

    const stmt = this.db.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
    stmt.run(collection, (record as any).id, JSON.stringify(record));
    return record;
  }

  async update<T extends DatabaseEntity>(collection: string, id: string, updates: Partial<T>): Promise<T | null> {
    if (!this.db) return this.fallback.update(collection, id, updates);

    const existing = await this.query<T>(collection, { id } as Partial<T>);
    if (existing.length === 0) return null;

    const updated = { ...existing[0], ...updates };
    await this.insert(collection, updated);
    return updated;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    if (!this.db) return this.fallback.delete(collection, id);

    const stmt = this.db.prepare('DELETE FROM records WHERE collection = ? AND id = ?');
    const result = stmt.run(collection, id);
    return result.changes > 0;
  }
}

/**
 * MemoryAdapter - In-memory storage for testing
 */
export class MemoryAdapter implements DatabaseAdapter {
  private connected = false;
  private store: Map<string, DatabaseEntity[]> = new Map();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.store.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async query<T extends DatabaseEntity>(collection: string, filter?: Partial<T>): Promise<T[]> {
    const records = (this.store.get(collection) || []) as T[];
    if (!filter) return records;

    return records.filter(record => {
      return Object.entries(filter).every(([key, value]) => {
        return record[key as keyof T] === value;
      });
    });
  }

  async insert<T extends DatabaseEntity>(collection: string, record: T): Promise<T> {
    const records = this.store.get(collection) || [];
    records.push(record);
    this.store.set(collection, records);
    return record;
  }

  async update<T extends DatabaseEntity>(collection: string, id: string, updates: Partial<T>): Promise<T | null> {
    const records = (this.store.get(collection) || []) as T[];
    const index = records.findIndex((r: any) => r.id === id);
    if (index === -1) return null;

    records[index] = { ...records[index], ...updates };
    this.store.set(collection, records);
    return records[index];
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const records = this.store.get(collection) || [];
    const filtered = records.filter((r: any) => r.id !== id);
    if (filtered.length === records.length) return false;

    this.store.set(collection, filtered);
    return true;
  }
}
