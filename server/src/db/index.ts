/**
 * Unified database manager for GetSticky
 * Combines SQLite (structured data) and LanceDB (vector search)
 */

import { SQLiteDB } from './sqlite';
import { LanceDBManager } from './lancedb';
import { Node, Edge, NodeType, ContextSource, Board } from '../types';

export class DatabaseManager {
  private sqlite: SQLiteDB;
  private lancedb: LanceDBManager;
  private initialized: boolean = false;

  constructor(dbPath: string = './getsticky-data') {
    this.sqlite = new SQLiteDB(`${dbPath}/getsticky.db`);
    this.lancedb = new LanceDBManager(`${dbPath}/lancedb`);
  }

  /**
   * Initialize databases (async for LanceDB)
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.lancedb.init();
    this.initialized = true;
  }

  /**
   * Node operations
   */

  async createNode(node: {
    id: string;
    type: NodeType;
    content: string;
    context?: string;
    parent_id?: string | null;
    board_id?: string;
  }): Promise<Node> {
    const boardId = node.board_id || 'default';
    const createdNode = this.sqlite.createNode({
      id: node.id,
      type: node.type,
      content: node.content,
      context: node.context || '',
      parent_id: node.parent_id || null,
      board_id: boardId,
    });

    // Add context to vector DB if provided
    if (node.context) {
      await this.lancedb.addContext({
        nodeId: node.id,
        boardId,
        text: node.context,
        source: 'user',
      });
    }

    return createdNode;
  }

  getNode(id: string): Node | null {
    return this.sqlite.getNode(id);
  }

  getAllNodes(boardId?: string): Node[] {
    return this.sqlite.getAllNodes(boardId);
  }

  async updateNode(id: string, updates: {
    content?: string;
    context?: string;
    type?: NodeType;
  }): Promise<Node | null> {
    const node = this.sqlite.updateNode(id, updates);

    // Update vector DB if context changed
    if (updates.context && node) {
      const oldContexts = await this.lancedb.getContextsForNode(id);
      if (oldContexts.length > 0) {
        await this.lancedb.deleteNodeContexts(id);
      }

      await this.lancedb.addContext({
        nodeId: id,
        text: updates.context,
        source: 'user',
      });
    }

    return node;
  }

  async deleteNode(id: string): Promise<boolean> {
    // Delete from vector DB first
    await this.lancedb.deleteNodeContexts(id);

    // Then delete from SQLite (cascades to edges)
    return this.sqlite.deleteNode(id);
  }

  /**
   * Edge operations
   */

  createEdge(edge: Edge): Edge {
    return this.sqlite.createEdge(edge);
  }

  getEdge(id: string): Edge | null {
    return this.sqlite.getEdge(id);
  }

  getEdgesForNode(nodeId: string): { incoming: Edge[]; outgoing: Edge[] } {
    return this.sqlite.getEdgesForNode(nodeId);
  }

  getAllEdges(boardId?: string): Edge[] {
    return this.sqlite.getAllEdges(boardId);
  }

  deleteEdge(id: string): boolean {
    return this.sqlite.deleteEdge(id);
  }

  /**
   * Context operations
   */

  async addContext(nodeId: string, text: string, source: ContextSource): Promise<void> {
    // Add to SQLite context chain
    this.sqlite.addContextEntry({
      node_id: nodeId,
      context_entry: text,
      source,
      embedding: null,
    });

    // Add to vector DB for semantic search
    await this.lancedb.addContext({
      nodeId,
      text,
      source,
    });

    // Update node's accumulated context
    const node = this.sqlite.getNode(nodeId);
    if (node) {
      const newContext = node.context ? `${node.context}\n\n${text}` : text;
      this.sqlite.updateNode(nodeId, { context: newContext });
    }
  }

  getContextForNode(nodeId: string): string {
    const node = this.sqlite.getNode(nodeId);
    return node?.context || '';
  }

  getInheritedContext(nodeId: string): string {
    return this.sqlite.getInheritedContext(nodeId);
  }

  /**
   * Semantic search across all contexts
   */
  async searchContext(query: string, limit: number = 5, boardId?: string) {
    return await this.lancedb.search(query, limit, boardId);
  }

  /**
   * Search within a specific node
   */
  async searchInNode(nodeId: string, query: string, limit: number = 5) {
    return await this.lancedb.searchInNode(nodeId, query, limit);
  }

  /**
   * Branching: create child node with inherited context
   */
  async branchNode(parentId: string, newNodeData: {
    id: string;
    type: NodeType;
    content: string;
  }): Promise<Node | null> {
    const childNode = this.sqlite.branchNode(parentId, newNodeData);

    if (childNode && childNode.context) {
      // Add inherited context to vector DB
      await this.lancedb.addContext({
        nodeId: childNode.id,
        text: childNode.context,
        source: 'agent',
      });
    }

    return childNode;
  }

  /**
   * Get conversation tree
   */
  getChildNodes(parentId: string): Node[] {
    return this.sqlite.getChildNodes(parentId);
  }

  /**
   * Get the full conversation path from root to node
   */
  getConversationPath(nodeId: string): Node[] {
    const path: Node[] = [];
    const visited = new Set<string>();
    let currentNode = this.sqlite.getNode(nodeId);

    while (currentNode && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);
      path.unshift(currentNode);
      currentNode = currentNode.parent_id ? this.sqlite.getNode(currentNode.parent_id) : null;
    }

    return path;
  }

  /**
   * Get database statistics
   */
  async getStats(boardId?: string) {
    const nodes = this.sqlite.getAllNodes(boardId);
    const edges = this.sqlite.getAllEdges(boardId);
    const vectorStats = await this.lancedb.getStats();

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType: nodes.reduce((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      ...vectorStats,
    };
  }

  /**
   * Board operations
   */

  createBoard(id: string, name: string): Board {
    return this.sqlite.createBoard(id, name);
  }

  getBoard(id: string): Board | null {
    return this.sqlite.getBoard(id);
  }

  getAllBoards(): Board[] {
    return this.sqlite.getAllBoards();
  }

  updateBoardViewport(boardId: string, x: number, y: number, zoom: number): void {
    this.sqlite.updateBoardViewport(boardId, x, y, zoom);
  }

  getBoardViewport(boardId: string): { x: number; y: number; zoom: number } | null {
    return this.sqlite.getBoardViewport(boardId);
  }

  async deleteBoard(id: string): Promise<boolean> {
    // Clean up LanceDB contexts for this board
    await this.lancedb.deleteBoardContexts(id);
    // Clean up SQLite (nodes, edges, context_chain, board row)
    return this.sqlite.deleteBoard(id);
  }

  /**
   * Settings operations
   */

  getSetting(key: string): string | null {
    return this.sqlite.getSetting(key);
  }

  setSetting(key: string, value: string): void {
    this.sqlite.setSetting(key, value);
  }

  getAllSettings(): Record<string, string> {
    return this.sqlite.getAllSettings();
  }

  /**
   * Export graph data for visualization
   */
  exportGraph(boardId?: string): { nodes: Node[]; edges: Edge[] } {
    return {
      nodes: this.sqlite.getAllNodes(boardId),
      edges: this.sqlite.getAllEdges(boardId),
    };
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    this.sqlite.close();
    await this.lancedb.close();
    this.initialized = false;
  }
}

// Export singleton instance
export let dbManager: DatabaseManager | null = null;

export function getDB(dbPath?: string): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager(dbPath);
  }
  return dbManager;
}

export async function initDB(dbPath?: string): Promise<DatabaseManager> {
  const db = getDB(dbPath);
  await db.init();
  return db;
}

export { SQLiteDB, LanceDBManager };
