/**
 * SQLite database layer for GetSticky
 * Handles structured node data, edges, and context storage
 */

import { homedir } from 'os';
import Database from 'better-sqlite3';
import { Node, Edge, ContextEntry, NodeType, ContextSource, Board, Project } from '../types';
import path from 'path';
import fs from 'fs';

export class SQLiteDB {
  private db: Database.Database;

  constructor(dbPath: string = path.join(homedir(), '.getsticky', 'data', 'getsticky.db')) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default project
    this.db.exec(`
      INSERT OR IGNORE INTO projects (id, name) VALUES ('default', 'Default Project')
    `);

    // Create boards table (original schema — migrations add slug/project_id below)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default board (original columns only — slug/project_id set after migration)
    this.db.exec(`
      INSERT OR IGNORE INTO boards (id, name) VALUES ('default', 'Default Board')
    `);

    // Create nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        parent_id TEXT,
        board_id TEXT NOT NULL DEFAULT 'default',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE SET NULL
      )
    `);

    // Migrate: add board_id column if missing (for existing databases)
    const columns = this.db.pragma('table_info(nodes)') as { name: string }[];
    if (!columns.some((col) => col.name === 'board_id')) {
      this.db.exec(`ALTER TABLE nodes ADD COLUMN board_id TEXT NOT NULL DEFAULT 'default'`);
    }

    // Migrate: add slug and project_id columns to boards table
    const boardColumns = this.db.pragma('table_info(boards)') as { name: string }[];
    if (!boardColumns.some((col) => col.name === 'slug')) {
      this.db.exec(`ALTER TABLE boards ADD COLUMN slug TEXT NOT NULL DEFAULT ''`);
      this.db.exec(`ALTER TABLE boards ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'`);
      // Set slug to 'main' for the default board, and to the id for all others
      this.db.exec(`UPDATE boards SET slug = 'main' WHERE id = 'default'`);
      this.db.exec(`UPDATE boards SET slug = id WHERE slug = ''`);
    }
    // Ensure the default board always has correct slug/project_id (covers fresh and migrated DBs)
    this.db.exec(`UPDATE boards SET slug = 'main', project_id = 'default' WHERE id = 'default' AND slug = ''`);
    // Fix any boards that ended up with empty slugs (use id as fallback, with suffix to avoid conflicts)
    const emptySlugBoards = this.db.prepare(`SELECT id, project_id FROM boards WHERE slug = '' AND id != 'default'`).all() as { id: string; project_id: string }[];
    for (const b of emptySlugBoards) {
      let candidate = b.id;
      let suffix = 2;
      while (this.db.prepare(`SELECT 1 FROM boards WHERE project_id = ? AND slug = ?`).get(b.project_id, candidate)) {
        candidate = `${b.id}-${suffix++}`;
      }
      this.db.prepare(`UPDATE boards SET slug = ? WHERE id = ?`).run(candidate, b.id);
    }

    // Create unique index on (project_id, slug) for boards
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_project_slug ON boards(project_id, slug)
    `);

    // Migrate: add viewport columns to boards table
    const boardColumnsForViewport = this.db.pragma('table_info(boards)') as { name: string }[];
    if (!boardColumnsForViewport.some((col) => col.name === 'viewport_x')) {
      this.db.exec(`BEGIN`);
      this.db.exec(`ALTER TABLE boards ADD COLUMN viewport_x REAL`);
      this.db.exec(`ALTER TABLE boards ADD COLUMN viewport_y REAL`);
      this.db.exec(`ALTER TABLE boards ADD COLUMN viewport_zoom REAL`);
      this.db.exec(`COMMIT`);
    }

    // Create edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        label TEXT,
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
      )
    `);

    // Create context_chain table for context inheritance
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_chain (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        context_entry TEXT NOT NULL,
        source TEXT NOT NULL,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
      )
    `);

    // Create settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_board ON nodes(board_id);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_context_node ON context_chain(node_id);
    `);
  }

  /**
   * Node CRUD operations
   */

  createNode(node: Omit<Node, 'created_at' | 'updated_at'>): Node {
    const stmt = this.db.prepare(`
      INSERT INTO nodes (id, type, content, context, parent_id, board_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      node.id,
      node.type,
      node.content,
      node.context || '',
      node.parent_id,
      node.board_id || 'default'
    );

    return this.getNode(node.id)!;
  }

  getNode(id: string): Node | null {
    const stmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    return stmt.get(id) as Node | null;
  }

  getAllNodes(boardId?: string): Node[] {
    if (boardId) {
      const stmt = this.db.prepare('SELECT * FROM nodes WHERE board_id = ? ORDER BY created_at DESC');
      return stmt.all(boardId) as Node[];
    }
    const stmt = this.db.prepare('SELECT * FROM nodes ORDER BY created_at DESC');
    return stmt.all() as Node[];
  }

  updateNode(id: string, updates: Partial<Omit<Node, 'id' | 'created_at'>>): Node | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.context !== undefined) {
      fields.push('context = ?');
      values.push(updates.context);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.parent_id !== undefined) {
      fields.push('parent_id = ?');
      values.push(updates.parent_id);
    }

    if (fields.length === 0) return this.getNode(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE nodes SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
    return this.getNode(id);
  }

  deleteNode(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM nodes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Edge CRUD operations
   */

  createEdge(edge: Edge): Edge {
    const stmt = this.db.prepare(`
      INSERT INTO edges (id, source_id, target_id, label)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(edge.id, edge.source_id, edge.target_id, edge.label);
    return edge;
  }

  getEdge(id: string): Edge | null {
    const stmt = this.db.prepare('SELECT * FROM edges WHERE id = ?');
    return stmt.get(id) as Edge | null;
  }

  getEdgesForNode(nodeId: string): { incoming: Edge[]; outgoing: Edge[] } {
    const incoming = this.db.prepare('SELECT * FROM edges WHERE target_id = ?').all(nodeId) as Edge[];
    const outgoing = this.db.prepare('SELECT * FROM edges WHERE source_id = ?').all(nodeId) as Edge[];

    return { incoming, outgoing };
  }

  getAllEdges(boardId?: string): Edge[] {
    if (boardId) {
      const stmt = this.db.prepare('SELECT e.* FROM edges e JOIN nodes n ON e.source_id = n.id WHERE n.board_id = ?');
      return stmt.all(boardId) as Edge[];
    }
    const stmt = this.db.prepare('SELECT * FROM edges');
    return stmt.all() as Edge[];
  }

  updateEdge(id: string, label: string): Edge | null {
    const stmt = this.db.prepare('UPDATE edges SET label = ? WHERE id = ?');
    const result = stmt.run(label, id);
    if (result.changes === 0) return null;
    return this.getEdge(id);
  }

  deleteEdge(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM edges WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Context chain operations
   */

  addContextEntry(entry: Omit<ContextEntry, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO context_chain (node_id, context_entry, source, embedding)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      entry.node_id,
      entry.context_entry,
      entry.source,
      entry.embedding
    );
  }

  getContextForNode(nodeId: string): ContextEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM context_chain
      WHERE node_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(nodeId) as ContextEntry[];
  }

  /**
   * Context inheritance: when branching, get parent's context
   */
  getInheritedContext(nodeId: string): string {
    const node = this.getNode(nodeId);
    if (!node || !node.parent_id) {
      return node?.context || '';
    }

    // Build context from parent chain with cycle detection
    const contexts: string[] = [];
    const visited = new Set<string>();
    let currentNode: Node | null = node;

    while (currentNode && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);
      if (currentNode.context) {
        contexts.unshift(currentNode.context);
      }
      currentNode = currentNode.parent_id ? this.getNode(currentNode.parent_id) : null;
    }

    return contexts.join('\n\n');
  }

  /**
   * Branching: create a child node that inherits parent's context
   */
  branchNode(parentId: string, newNodeData: {
    id: string;
    type: NodeType;
    content: string;
  }): Node | null {
    const parent = this.getNode(parentId);
    if (!parent) return null;

    // Inherit parent's context and board
    const inheritedContext = this.getInheritedContext(parentId);

    return this.createNode({
      id: newNodeData.id,
      type: newNodeData.type,
      content: newNodeData.content,
      context: inheritedContext,
      parent_id: parentId,
      board_id: parent.board_id,
    });
  }

  /**
   * Get all child nodes (for visualization)
   */
  getChildNodes(parentId: string): Node[] {
    const stmt = this.db.prepare('SELECT * FROM nodes WHERE parent_id = ?');
    return stmt.all(parentId) as Node[];
  }

  /**
   * Project CRUD operations
   */

  createProject(id: string, name: string): Project {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name) VALUES (?, ?)
    `);
    stmt.run(id, name);
    return this.getProject(id)!;
  }

  getProject(id: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) as Project | null;
  }

  getAllProjects(): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    return stmt.all() as Project[];
  }

  deleteProject(id: string): boolean {
    if (id === 'default') {
      throw new Error('Cannot delete the default project');
    }
    const project = this.getProject(id);
    if (!project) return false;

    const deleteTransaction = this.db.transaction(() => {
      // Get all boards in this project
      const boards = this.getBoardsForProject(id);
      for (const board of boards) {
        // Delete context_chain entries for this board's nodes
        this.db.prepare(`
          DELETE FROM context_chain WHERE node_id IN (
            SELECT id FROM nodes WHERE board_id = ?
          )
        `).run(board.id);
        // Delete edges
        this.db.prepare(`
          DELETE FROM edges WHERE source_id IN (
            SELECT id FROM nodes WHERE board_id = ?
          ) OR target_id IN (
            SELECT id FROM nodes WHERE board_id = ?
          )
        `).run(board.id, board.id);
        // Delete nodes
        this.db.prepare('DELETE FROM nodes WHERE board_id = ?').run(board.id);
      }
      // Delete all boards in this project
      this.db.prepare('DELETE FROM boards WHERE project_id = ?').run(id);
      // Delete the project
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });

    deleteTransaction();
    return true;
  }

  /** Idempotent: get existing project or create it */
  getOrCreateProject(id: string, name: string): Project {
    const existing = this.getProject(id);
    if (existing) return existing;
    return this.createProject(id, name);
  }

  /**
   * Board CRUD operations
   */

  createBoard(id: string, name: string, projectId: string = 'default', slug?: string): Board {
    const boardSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || id;
    const stmt = this.db.prepare(`
      INSERT INTO boards (id, name, slug, project_id)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, boardSlug, projectId);
    return this.getBoard(id)!;
  }

  getBoard(id: string): Board | null {
    const stmt = this.db.prepare('SELECT * FROM boards WHERE id = ?');
    return stmt.get(id) as Board | null;
  }

  getAllBoards(): Board[] {
    const stmt = this.db.prepare('SELECT * FROM boards ORDER BY created_at DESC');
    return stmt.all() as Board[];
  }

  getBoardBySlug(projectId: string, slug: string): Board | null {
    const stmt = this.db.prepare('SELECT * FROM boards WHERE project_id = ? AND slug = ?');
    return stmt.get(projectId, slug) as Board | null;
  }

  getBoardsForProject(projectId: string): Board[] {
    const stmt = this.db.prepare('SELECT * FROM boards WHERE project_id = ? ORDER BY created_at DESC');
    return stmt.all(projectId) as Board[];
  }

  /** Idempotent: get existing board or create it */
  getOrCreateBoard(projectId: string, slug: string, name: string): Board {
    const existing = this.getBoardBySlug(projectId, slug);
    if (existing) return existing;
    const boardId = `${projectId}:${slug}`;
    return this.createBoard(boardId, name, projectId, slug);
  }

  updateBoardViewport(boardId: string, x: number, y: number, zoom: number): void {
    const stmt = this.db.prepare(`
      UPDATE boards SET viewport_x = ?, viewport_y = ?, viewport_zoom = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(x, y, zoom, boardId);
  }

  getBoardViewport(boardId: string): { x: number; y: number; zoom: number } | null {
    const stmt = this.db.prepare('SELECT viewport_x, viewport_y, viewport_zoom FROM boards WHERE id = ?');
    const row = stmt.get(boardId) as { viewport_x: number | null; viewport_y: number | null; viewport_zoom: number | null } | undefined;
    if (!row || row.viewport_x == null || row.viewport_y == null || row.viewport_zoom == null) {
      return null;
    }
    return { x: row.viewport_x, y: row.viewport_y, zoom: row.viewport_zoom };
  }

  deleteBoard(id: string): boolean {
    if (id === 'default') {
      throw new Error('Cannot delete the default board');
    }

    const board = this.getBoard(id);
    if (!board) return false;

    // Use a transaction to clean up all related data
    const deleteTransaction = this.db.transaction(() => {
      // Delete context_chain entries for this board's nodes
      this.db.prepare(`
        DELETE FROM context_chain WHERE node_id IN (
          SELECT id FROM nodes WHERE board_id = ?
        )
      `).run(id);

      // Delete edges where source or target belongs to this board
      this.db.prepare(`
        DELETE FROM edges WHERE source_id IN (
          SELECT id FROM nodes WHERE board_id = ?
        ) OR target_id IN (
          SELECT id FROM nodes WHERE board_id = ?
        )
      `).run(id, id);

      // Delete all nodes on this board
      this.db.prepare('DELETE FROM nodes WHERE board_id = ?').run(id);

      // Delete the board itself
      this.db.prepare('DELETE FROM boards WHERE id = ?').run(id);
    });

    deleteTransaction();
    return true;
  }

  /**
   * Settings operations
   *
   * WARNING: Settings values (including API keys) are stored as plaintext in
   * the local SQLite database. Do not share or commit the DB file. In future,
   * consider using the OS keychain (e.g. keytar) for sensitive credentials.
   */

  getSetting(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (@key, @value, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({ key, value });
  }

  getAllSettings(): Record<string, string> {
    const stmt = this.db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /**
   * Cleanup and close
   */
  close(): void {
    this.db.close();
  }
}
