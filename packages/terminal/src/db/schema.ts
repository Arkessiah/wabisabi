import { z } from 'zod';

/**
 * Database entity schemas using Zod for runtime validation
 */

export const ConversationRecordSchema = z.object({
  id: z.string(),
  projectRoot: z.string(),
  agent: z.string(),
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    timestamp: z.number(),
    metadata: z.record(z.any()).optional(),
  })),
  created: z.number(),
  updated: z.number(),
  tags: z.array(z.string()).default([]),
});

export const EmbeddingRecordSchema = z.object({
  id: z.string(),
  content: z.string(),
  vector: z.array(z.number()),
  metadata: z.record(z.any()).optional(),
  created: z.number(),
});

export const CacheRecordSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.any(),
  ttl: z.number().nullable(),
  created: z.number(),
});

export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;
export type EmbeddingRecord = z.infer<typeof EmbeddingRecordSchema>;
export type CacheRecord = z.infer<typeof CacheRecordSchema>;

export type DatabaseEntity = ConversationRecord | EmbeddingRecord | CacheRecord;
