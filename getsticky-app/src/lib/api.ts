/**
 * API Layer for GetSticky Frontend
 *
 * Provides type-safe interface to backend operations via WebSocket
 */

import { getWebSocketClient } from './websocket';

// ============================================================================
// Type Definitions
// ============================================================================

export interface NodeData {
  [key: string]: any;
}

export interface CreateNodeParams {
  type: string;
  position: { x: number; y: number };
  data: NodeData;
  parentId?: string;
}

export interface UpdateNodeParams {
  id: string;
  data?: Partial<NodeData>;
  position?: { x: number; y: number };
}

export interface CreateEdgeParams {
  source: string;
  target: string;
  animated?: boolean;
  style?: Record<string, any>;
}


// ============================================================================
// API Class
// ============================================================================

export class GetStickyAPI {
  private ws;

  constructor(wsUrl?: string) {
    this.ws = getWebSocketClient(wsUrl);
  }

  /**
   * Initialize connection to backend
   */
  async connect(): Promise<void> {
    return this.ws.connect();
  }

  /**
   * Disconnect from backend
   */
  disconnect(): void {
    this.ws.disconnect();
  }

  /**
   * Subscribe to backend events
   */
  on(event: string, handler: (data: any) => void): () => void {
    return this.ws.on(event, handler);
  }

  /**
   * Unsubscribe from backend events
   */
  off(event: string, handler?: (data: any) => void): void {
    this.ws.off(event, handler);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws.isConnected();
  }

  // ==========================================================================
  // Node Operations
  // ==========================================================================

  /**
   * Create a new node
   */
  createNode(params: CreateNodeParams): void {
    this.ws.send('create_node', params);
  }

  /**
   * Update an existing node
   */
  updateNode(params: UpdateNodeParams): void {
    this.ws.send('update_node', params);
  }

  /**
   * Delete a node
   */
  deleteNode(nodeId: string): void {
    this.ws.send('delete_node', { id: nodeId });
  }

  // ==========================================================================
  // Edge Operations
  // ==========================================================================

  /**
   * Create a new edge between nodes
   */
  createEdge(params: CreateEdgeParams): void {
    this.ws.send('create_edge', params);
  }

  /**
   * Delete an edge
   */
  deleteEdge(edgeId: string): void {
    this.ws.send('delete_edge', { id: edgeId });
  }

  // ==========================================================================
  // Conversation Operations
  // ==========================================================================

  /**
   * Ask Claude a question (direct method)
   * Backend expects: { question, context?, parent_id? }
   */
  askClaude(question: string, context?: string, parentId?: string): void {
    this.ws.send('ask_claude', {
      question,
      context,
      parent_id: parentId,
    });
  }

  /**
   * Ask Claude about a specific comment thread in a review node
   */
  askClaudeInComment(
    nodeId: string,
    threadId: string,
    selectedText: string,
    messages: { author: string; text: string }[]
  ): void {
    this.ws.send('comment_ask_claude', {
      node_id: nodeId,
      thread_id: threadId,
      selected_text: selectedText,
      messages,
    });
  }

  // ==========================================================================
  // Settings Operations
  // ==========================================================================

  /**
   * Fetch current settings from backend
   */
  getSettings(): void {
    this.ws.send('get_settings', {});
  }

  /**
   * Update settings (agent name and/or API key)
   */
  updateSettings(settings: { agentName?: string; apiKey?: string }): void {
    this.ws.send('update_settings', settings);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let apiInstance: GetStickyAPI | null = null;

/**
 * Get or create API instance
 */
export function getAPI(wsUrl?: string): GetStickyAPI {
  if (!apiInstance) {
    apiInstance = new GetStickyAPI(wsUrl);
  }
  return apiInstance;
}

/**
 * Destroy API instance
 */
export function destroyAPI(): void {
  if (apiInstance) {
    apiInstance.disconnect();
    apiInstance = null;
  }
}
