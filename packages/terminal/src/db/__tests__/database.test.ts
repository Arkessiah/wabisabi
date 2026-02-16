import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseManager } from '../index';
import type { ConversationRecord, CacheRecord } from '../schema';

describe('DatabaseManager', () => {
  let db: DatabaseManager;

  beforeEach(async () => {
    db = new DatabaseManager();
    await db.initialize({ adapter: 'memory' });
  });

  afterEach(async () => {
    await db.shutdown();
  });

  test('should initialize successfully', () => {
    expect(db.isReady()).toBe(true);
  });

  test('should create and retrieve conversations', async () => {
    const conversation: ConversationRecord = {
      id: 'test-1',
      projectRoot: '/test/project',
      agent: 'coder',
      model: 'qwen3-coder',
      messages: [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
      ],
      created: Date.now(),
      updated: Date.now(),
      tags: ['test'],
    };

    await db.createConversation(conversation);
    const conversations = await db.getConversations({ id: 'test-1' });

    expect(conversations.length).toBe(1);
    expect(conversations[0].id).toBe('test-1');
    expect(conversations[0].messages.length).toBe(2);
  });

  test('should update conversations', async () => {
    const conversation: ConversationRecord = {
      id: 'test-2',
      projectRoot: '/test/project',
      agent: 'coder',
      model: 'qwen3-coder',
      messages: [],
      created: Date.now(),
      updated: Date.now(),
      tags: [],
    };

    await db.createConversation(conversation);
    const updated = await db.updateConversation('test-2', { tags: ['updated'] });

    expect(updated?.tags).toEqual(['updated']);
  });

  test('should handle cache with TTL', async () => {
    const cache: CacheRecord = {
      id: 'cache-1',
      key: 'test-key',
      value: { data: 'test' },
      ttl: 1000, // 1 second
      created: Date.now(),
    };

    await db.setCacheValue(cache);
    const retrieved = await db.getCacheValue('test-key');

    expect(retrieved?.value.data).toBe('test');

    // Test expiration
    const expiredCache: CacheRecord = {
      id: 'cache-2',
      key: 'expired-key',
      value: { data: 'old' },
      ttl: 100,
      created: Date.now() - 200, // Already expired
    };

    await db.setCacheValue(expiredCache);
    const expired = await db.getCacheValue('expired-key');

    expect(expired).toBeNull();
  });

  test('should delete records', async () => {
    const conversation: ConversationRecord = {
      id: 'test-delete',
      projectRoot: '/test',
      agent: 'coder',
      model: 'qwen3-coder',
      messages: [],
      created: Date.now(),
      updated: Date.now(),
      tags: [],
    };

    await db.createConversation(conversation);
    const deleted = await db.deleteConversation('test-delete');
    const conversations = await db.getConversations({ id: 'test-delete' });

    expect(deleted).toBe(true);
    expect(conversations.length).toBe(0);
  });
});
