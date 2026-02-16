/**
 * LanceDB vector database layer for GetSticky
 * Handles semantic search across all node contexts
 */

import { homedir } from 'os';
import path from 'path';
import * as lancedb from '@lancedb/lancedb';
import { VectorContext, ContextSource } from '../types';
import { OpenAI } from 'openai';

/** Escape a string value for use in LanceDB SQL-like filter expressions */
function escapeFilterValue(value: string): string {
  return value.replace(/'/g, "''");
}

export class LanceDBManager {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private openai: OpenAI | null = null;
  private readonly tableName = 'contexts';
  private readonly dbPath: string;
  private readonly enabled: boolean;

  constructor(dbPath: string = path.join(homedir(), '.getsticky', 'data', 'lancedb'), apiKey?: string) {
    this.dbPath = dbPath;
    const key = apiKey || process.env.OPENAI_API_KEY;
    this.enabled = !!key;

    if (this.enabled) {
      this.openai = new OpenAI({ apiKey: key });
    } else {
      console.warn('⚠️  LanceDB disabled: OPENAI_API_KEY not set - semantic search unavailable');
    }
  }

  /**
   * Initialize the database and table
   */
  async init(): Promise<void> {
    if (!this.enabled) {
      console.log('LanceDB initialization skipped (no API key)');
      return;
    }

    this.db = await lancedb.connect(this.dbPath);

    try {
      // Try to open existing table
      this.table = await this.db.openTable(this.tableName);
    } catch (error) {
      // Table doesn't exist, create it with initial empty data
      console.log('Creating new contexts table...');
      // LanceDB requires at least one row to create table with schema
      const initialData: VectorContext[] = [{
        nodeId: '_init',
        boardId: 'default',
        text: 'Initial context entry',
        vector: await this.generateEmbedding('Initial context entry'),
        source: 'agent' as ContextSource,
        createdAt: new Date(),
      }];

      this.table = await this.db.createTable(this.tableName, initialData as unknown as Record<string, unknown>[]);

      // Delete the initialization row
      await this.table.delete('nodeId = "_init"');
    }
  }

  /**
   * Generate embedding using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.enabled || !this.openai) {
      throw new Error('LanceDB is disabled - OPENAI_API_KEY not set');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', // 1536 dimensions, fast and cheap
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Add context with automatic embedding generation
   */
  async addContext(context: {
    nodeId: string;
    boardId?: string;
    text: string;
    source: ContextSource;
  }): Promise<void> {
    if (!this.enabled) {
      // Silently skip if disabled
      return;
    }

    if (!this.table) {
      await this.init();
    }

    const vector = await this.generateEmbedding(context.text);

    const vectorContext: VectorContext = {
      nodeId: context.nodeId,
      boardId: context.boardId || 'default',
      text: context.text,
      vector,
      source: context.source,
      createdAt: new Date(),
    };

    await this.table!.add([vectorContext as unknown as Record<string, unknown>]);
  }

  /**
   * Batch add contexts (more efficient for multiple entries)
   */
  async addContexts(contexts: Array<{
    nodeId: string;
    boardId?: string;
    text: string;
    source: ContextSource;
  }>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.table) {
      await this.init();
    }

    const vectorContexts: VectorContext[] = await Promise.all(
      contexts.map(async (ctx) => ({
        nodeId: ctx.nodeId,
        boardId: ctx.boardId || 'default',
        text: ctx.text,
        vector: await this.generateEmbedding(ctx.text),
        source: ctx.source,
        createdAt: new Date(),
      }))
    );

    await this.table!.add(vectorContexts as unknown as Record<string, unknown>[]);
  }

  /**
   * Semantic search across all contexts
   */
  async search(query: string, limit: number = 5, boardId?: string): Promise<VectorContext[]> {
    if (!this.enabled) {
      return [];
    }

    if (!this.table) {
      await this.init();
    }

    const queryVector = await this.generateEmbedding(query);

    let searchQuery = this.table!.search(queryVector).limit(limit);
    if (boardId) {
      searchQuery = searchQuery.where(`boardId = '${escapeFilterValue(boardId)}'`);
    }

    const results = await searchQuery.toArray();
    return results as VectorContext[];
  }

  /**
   * Search within a specific node's contexts
   */
  async searchInNode(nodeId: string, query: string, limit: number = 5): Promise<VectorContext[]> {
    if (!this.enabled) {
      return [];
    }

    if (!this.table) {
      await this.init();
    }

    const queryVector = await this.generateEmbedding(query);

    const results = await this.table!
      .search(queryVector)
      .where(`nodeId = '${escapeFilterValue(nodeId)}'`)
      .limit(limit)
      .toArray();

    return results as VectorContext[];
  }

  /**
   * Get all contexts for a specific node
   */
  async getContextsForNode(nodeId: string): Promise<VectorContext[]> {
    if (!this.enabled) {
      return [];
    }

    if (!this.table) {
      await this.init();
    }

    // Use filter for simple retrieval
    const results = await this.table!
      .query()
      .where(`nodeId = '${escapeFilterValue(nodeId)}'`)
      .toArray();

    return results as VectorContext[];
  }

  /**
   * Delete all contexts for a node
   */
  async deleteNodeContexts(nodeId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.table) {
      await this.init();
    }

    await this.table!.delete(`nodeId = '${escapeFilterValue(nodeId)}'`);
  }

  /**
   * Delete all contexts for a board
   */
  async deleteBoardContexts(boardId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.table) {
      await this.init();
    }

    await this.table!.delete(`boardId = '${escapeFilterValue(boardId)}'`);
  }

  /**
   * Get related contexts from different nodes (for cross-node insights)
   */
  async getRelatedContexts(text: string, excludeNodeId?: string, limit: number = 10): Promise<VectorContext[]> {
    if (!this.enabled) {
      return [];
    }

    if (!this.table) {
      await this.init();
    }

    const queryVector = await this.generateEmbedding(text);

    let query = this.table!.search(queryVector).limit(limit);

    if (excludeNodeId) {
      query = query.where(`nodeId != '${escapeFilterValue(excludeNodeId)}'`);
    }

    const results = await query.toArray();
    return results as VectorContext[];
  }

  /**
   * Update context text (requires delete and re-add due to embedding change)
   */
  async updateContext(nodeId: string, oldText: string, newText: string, source: ContextSource): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.table) {
      await this.init();
    }

    // Delete old context
    await this.table!.delete(`nodeId = '${escapeFilterValue(nodeId)}' AND text = '${escapeFilterValue(oldText)}'`);

    // Add new context with new embedding
    await this.addContext({ nodeId, text: newText, source });
  }

  /**
   * Get database stats
   */
  async getStats(): Promise<{ totalContexts: number; uniqueNodes: number }> {
    if (!this.enabled || !this.table) {
      return { totalContexts: 0, uniqueNodes: 0 };
    }

    const allContexts = await this.table!.query().toArray() as VectorContext[];
    const uniqueNodes = new Set(allContexts.map(c => c.nodeId)).size;

    return {
      totalContexts: allContexts.length,
      uniqueNodes,
    };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    // LanceDB connections are auto-managed, no explicit close needed
    this.db = null;
    this.table = null;
  }
}
