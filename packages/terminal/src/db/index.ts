import type { DatabaseAdapter } from './adapters';
import { FileAdapter, SqliteAdapter, MemoryAdapter } from './adapters';
import type { ConversationRecord, EmbeddingRecord, CacheRecord } from './schema';
import { ConversationRecordSchema, EmbeddingRecordSchema, CacheRecordSchema } from './schema';

export * from './schema';
export * from './adapters';

export interface DatabaseConfig {
  adapter?: 'file' | 'sqlite' | 'memory';
  path?: string;
}

/**
 * DatabaseManager - Singleton for managing database operations
 */
export class DatabaseManager {
  private adapter: DatabaseAdapter | null = null;
  private initialized = false;

  /**
   * Initialize database with auto-detection of best available adapter
   */
  async initialize(config?: DatabaseConfig): Promise<void> {
    if (this.initialized) return;

    const adapterType = config?.adapter || this.detectBestAdapter();

    switch (adapterType) {
      case 'sqlite':
        this.adapter = new SqliteAdapter(config?.path);
        break;
      case 'memory':
        this.adapter = new MemoryAdapter();
        break;
      case 'file':
      default:
        this.adapter = new FileAdapter(config?.path);
        break;
    }

    await this.adapter.connect();
    this.initialized = true;
  }

  private detectBestAdapter(): 'sqlite' | 'file' {
    try {
      require('bun:sqlite');
      return 'sqlite';
    } catch {
      return 'file';
    }
  }

  async shutdown(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
      this.initialized = false;
    }
  }

  isReady(): boolean {
    return this.initialized && this.adapter?.isConnected() || false;
  }

  // Conversations collection
  async getConversations(filter?: Partial<ConversationRecord>): Promise<ConversationRecord[]> {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter.query<ConversationRecord>('conversations', filter);
  }

  async createConversation(record: ConversationRecord): Promise<ConversationRecord> {
    if (!this.adapter) throw new Error('Database not initialized');
    const validated = ConversationRecordSchema.parse(record);
    return this.adapter.insert<ConversationRecord>('conversations', validated);
  }

  async updateConversation(id: string, updates: Partial<ConversationRecord>): Promise<ConversationRecord | null> {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter.update<ConversationRecord>('conversations', id, updates);
  }

  async deleteConversation(id: string): Promise<boolean> {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter.delete('conversations', id);
  }

  // Embeddings collection
  async getEmbeddings(filter?: Partial<EmbeddingRecord>): Promise<EmbeddingRecord[]> {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter.query<EmbeddingRecord>('embeddings', filter);
  }

  async createEmbedding(record: EmbeddingRecord): Promise<EmbeddingRecord> {
    if (!this.adapter) throw new Error('Database not initialized');
    const validated = EmbeddingRecordSchema.parse(record);
    return this.adapter.insert<EmbeddingRecord>('embeddings', validated);
  }

  async deleteEmbedding(id: string): Promise<boolean> {
    if (!this.adapter) throw new Error('Database not initialized');
    return this.adapter.delete('embeddings', id);
  }

  // Cache collection
  async getCacheValue(key: string): Promise<CacheRecord | null> {
    if (!this.adapter) throw new Error('Database not initialized');
    const records = await this.adapter.query<CacheRecord>('cache', { key } as Partial<CacheRecord>);
    if (records.length === 0) return null;

    const record = records[0];
    // Check TTL expiration
    if (record.ttl && Date.now() > record.created + record.ttl) {
      await this.adapter.delete('cache', record.id);
      return null;
    }

    return record;
  }

  async setCacheValue(record: CacheRecord): Promise<CacheRecord> {
    if (!this.adapter) throw new Error('Database not initialized');
    const validated = CacheRecordSchema.parse(record);

    // Remove existing cache with same key
    const existing = await this.adapter.query<CacheRecord>('cache', { key: record.key } as Partial<CacheRecord>);
    for (const old of existing) {
      await this.adapter.delete('cache', old.id);
    }

    return this.adapter.insert<CacheRecord>('cache', validated);
  }

  async deleteCacheValue(key: string): Promise<boolean> {
    if (!this.adapter) throw new Error('Database not initialized');
    const records = await this.adapter.query<CacheRecord>('cache', { key } as Partial<CacheRecord>);
    if (records.length === 0) return false;

    return this.adapter.delete('cache', records[0].id);
  }

  async clearExpiredCache(): Promise<number> {
    if (!this.adapter) throw new Error('Database not initialized');
    const records = await this.adapter.query<CacheRecord>('cache');
    let cleared = 0;

    for (const record of records) {
      if (record.ttl && Date.now() > record.created + record.ttl) {
        await this.adapter.delete('cache', record.id);
        cleared++;
      }
    }

    return cleared;
  }
}

// Export singleton instance
export const dbManager = new DatabaseManager();
