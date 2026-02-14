/**
 * Core types for GetSticky nodes and context storage
 */

export type NodeType = 'conversation' | 'diagram' | 'diagramBox' | 'container' | 'terminal' | 'richtext' | 'stickyNote';

export interface Board {
  id: string;
  name: string;
  viewport_x?: number | null;
  viewport_y?: number | null;
  viewport_zoom?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Node {
  id: string;
  type: NodeType;
  content: string; // JSON blob of node-specific data
  context: string;  // accumulated context for this node
  parent_id: string | null; // for conversation branching
  board_id: string;
  created_at: string;
  updated_at: string;
}

export interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  label: string | null;
}

export type ContextSource = 'user' | 'agent' | 'codebase' | 'diagram';

export interface ContextEntry {
  node_id: string;
  context_entry: string;
  source: ContextSource;
  embedding: Buffer | null; // vector embedding for semantic search
  created_at: string;
}

export interface VectorContext {
  nodeId: string;
  boardId: string;
  text: string;
  vector: number[]; // embedding vector
  source: ContextSource;
  createdAt: Date;
}

/**
 * Node content types (parsed from the content JSON blob)
 */

export interface ConversationContent {
  question: string;
  response: string;
  metadata?: Record<string, unknown>;
}

export interface DiagramContent {
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CommentMessage {
  id: string;
  author: 'user' | 'claude';
  text: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  selectedText: string;
  from: number;  // TipTap document position
  to: number;
  messages: CommentMessage[];
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface RichTextContent {
  tiptapJSON: Record<string, unknown>;
  plainText: string;
  title?: string;
  isReview?: boolean;
  comments?: CommentThread[];
}

export interface TerminalContent {
  command: string;
  output: string;
  exitCode: number;
}

export interface ContainerContent {
  title?: string;
  width?: number;
  height?: number;
}

export interface StickyNoteContent {
  text: string;
  color: string;
  position?: { x: number; y: number };
}
