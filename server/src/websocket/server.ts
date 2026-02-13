/**
 * WebSocket server for real-time communication with the frontend
 * Allows the React Flow canvas to sync with the database in real-time
 */

import { WebSocketServer, WebSocket } from 'ws';
import { DatabaseManager } from '../db/index';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { maskApiKey } from '../utils';

const VALID_WS_TYPES = new Set([
  'create_node', 'update_node', 'delete_node',
  'create_edge', 'delete_edge',
  'add_context', 'search_context',
  'ask_claude', 'comment_ask_claude',
  'get_settings', 'update_settings',
]);

export interface WSMessage {
  type: 'create_node' | 'update_node' | 'delete_node' | 'create_edge' | 'delete_edge' | 'add_context' | 'search_context' | 'ask_claude' | 'comment_ask_claude' | 'get_settings' | 'update_settings';
  data: any;
  id?: string;
}

export interface WSResponse {
  type: 'success' | 'error' | 'node_created' | 'node_updated' | 'node_deleted' | 'edge_created' | 'edge_deleted' | 'context_added' | 'search_results' | 'claude_response' | 'claude_streaming' | 'comment_claude_response' | 'settings';
  data?: any;
  error?: string;
  requestId?: string;
}

/** Strip HTML tags and limit length for safe display */
function sanitizeDisplayName(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim().slice(0, 50);
}

/** Get all settings with the API key masked */
function getMaskedSettings(db: DatabaseManager): Record<string, string> {
  const settings = db.getAllSettings();
  if (settings.anthropic_api_key) {
    settings.anthropic_api_key = maskApiKey(settings.anthropic_api_key);
  }
  return settings;
}

export class GetStickyWSServer {
  private wss: WebSocketServer;
  private db: DatabaseManager;
  private clients: Set<WebSocket> = new Set();
  private anthropic: Anthropic | null = null;

  constructor(port: number, db: DatabaseManager, anthropicApiKey?: string) {
    this.db = db;
    this.wss = new WebSocketServer({ port });

    // Try to load API key: DB first, then env fallback
    const dbApiKey = this.db.getSetting('anthropic_api_key');
    const apiKey = dbApiKey || anthropicApiKey;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }

    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');
      this.clients.add(ws);

      ws.on('message', async (data: string) => {
        try {
          const parsed = JSON.parse(data.toString());

          // Validate message shape
          if (!parsed || typeof parsed.type !== 'string') {
            this.sendError(ws, 'Invalid message: missing "type" field');
            return;
          }
          if (!VALID_WS_TYPES.has(parsed.type)) {
            this.sendError(ws, `Unknown message type: ${parsed.type}`, parsed.id);
            return;
          }
          if (parsed.data !== undefined && typeof parsed.data !== 'object') {
            this.sendError(ws, 'Invalid message: "data" must be an object', parsed.id);
            return;
          }

          const message: WSMessage = parsed;
          await this.handleMessage(ws, message);
        } catch (error: any) {
          this.sendError(ws, error.message);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial state
      this.sendInitialState(ws);
    });

    console.log(`WebSocket server running on port ${this.wss.options.port}`);
  }

  private async sendInitialState(ws: WebSocket): Promise<void> {
    const graph = this.db.exportGraph();
    this.send(ws, {
      type: 'success',
      data: {
        type: 'initial_state',
        nodes: graph.nodes,
        edges: graph.edges,
      },
    });
  }

  private async handleMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    const requestId = message.id;

    try {
      switch (message.type) {
        case 'create_node': {
          const { type, content, data: nodeData, context, parent_id, parentId, position } = message.data;
          // Support both MCP format (content) and frontend format (data + position)
          let nodeContent = content || nodeData || {};
          if (position && typeof nodeContent === 'object') {
            nodeContent = { ...nodeContent, position };
          }
          const node = await this.db.createNode({
            id: uuidv4(),
            type,
            content: JSON.stringify(nodeContent),
            context: context || '',
            parent_id: parent_id || parentId || null,
          });

          // Broadcast to all clients
          this.broadcast({
            type: 'node_created',
            data: node,
            requestId,
          });
          break;
        }

        case 'update_node': {
          const { id, content, data: partialData, context, position } = message.data;
          const updates: any = {};

          if (content) {
            // Full content replacement
            updates.content = JSON.stringify(content);
          } else if (partialData || position) {
            // Partial update: merge into existing content
            const existing = this.db.getNode(id);
            if (existing) {
              const existingContent = JSON.parse(existing.content);
              const merged = { ...existingContent, ...partialData };
              if (position) merged.position = position;
              updates.content = JSON.stringify(merged);
            }
          }
          if (context) updates.context = context;

          const node = await this.db.updateNode(id, updates);

          if (!node) {
            this.sendError(ws, `Node not found: ${id}`, requestId);
            return;
          }

          this.broadcast({
            type: 'node_updated',
            data: node,
            requestId,
          });
          break;
        }

        case 'delete_node': {
          const { id } = message.data;
          const success = await this.db.deleteNode(id);

          if (!success) {
            this.sendError(ws, `Node not found: ${id}`, requestId);
            return;
          }

          this.broadcast({
            type: 'node_deleted',
            data: { id },
            requestId,
          });
          break;
        }

        case 'create_edge': {
          const { source_id, target_id, source, target, label } = message.data;
          const edge = this.db.createEdge({
            id: uuidv4(),
            source_id: source_id || source,
            target_id: target_id || target,
            label: label || null,
          });

          this.broadcast({
            type: 'edge_created',
            data: edge,
            requestId,
          });
          break;
        }

        case 'delete_edge': {
          const { id } = message.data;
          const success = this.db.deleteEdge(id);

          if (!success) {
            this.sendError(ws, `Edge not found: ${id}`, requestId);
            return;
          }

          this.broadcast({
            type: 'edge_deleted',
            data: { id },
            requestId,
          });
          break;
        }

        case 'add_context': {
          const { node_id, text, source } = message.data;
          await this.db.addContext(node_id, text, source);

          this.broadcast({
            type: 'context_added',
            data: { node_id, text, source },
            requestId,
          });
          break;
        }

        case 'search_context': {
          const { query, limit = 5 } = message.data;
          const results = await this.db.searchContext(query, limit);

          this.send(ws, {
            type: 'search_results',
            data: results,
            requestId,
          });
          break;
        }

        case 'ask_claude': {
          await this.handleClaudeQuery(ws, message.data, requestId);
          break;
        }

        case 'comment_ask_claude': {
          await this.handleCommentClaudeQuery(ws, message.data, requestId);
          break;
        }

        case 'get_settings': {
          this.send(ws, {
            type: 'settings',
            data: getMaskedSettings(this.db),
            requestId,
          });
          break;
        }

        case 'update_settings': {
          const { agentName, apiKey } = message.data;

          if (agentName !== undefined) {
            const sanitized = sanitizeDisplayName(agentName);
            if (sanitized.length === 0) {
              this.sendError(ws, 'Agent name cannot be empty', requestId);
              return;
            }
            this.db.setSetting('agent_name', sanitized);
          }

          if (apiKey !== undefined && apiKey !== '') {
            // Basic format validation
            if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
              this.sendError(ws, 'Invalid API key format. Key should start with "sk-" and be at least 20 characters.', requestId);
              return;
            }
            this.db.setSetting('anthropic_api_key', apiKey);
            this.anthropic = new Anthropic({ apiKey });
            console.log('Anthropic client reinitialized with new API key');
          }

          this.broadcast({
            type: 'settings',
            data: getMaskedSettings(this.db),
            requestId,
          });
          break;
        }

        default:
          this.sendError(ws, `Unknown message type: ${message.type}`, requestId);
      }
    } catch (error: any) {
      this.sendError(ws, error.message, requestId);
    }
  }

  private send(ws: WebSocket, response: WSResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private broadcast(response: WSResponse): void {
    const message = JSON.stringify(response);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private sendError(ws: WebSocket, error: string, requestId?: string): void {
    this.send(ws, {
      type: 'error',
      error,
      requestId,
    });
  }

  /**
   * Create an AgentNode from a Claude response, optionally link to parent, and broadcast.
   */
  private async createAndBroadcastAgentNode(
    question: string,
    response: string,
    parent_id: string | undefined,
    node_position: { x: number; y: number } | undefined,
    requestId?: string,
  ): Promise<void> {
    const agentNode = await this.db.createNode({
      id: uuidv4(),
      type: 'conversation',
      content: JSON.stringify({ question, response, position: node_position }),
      context: response,
      parent_id: parent_id || null,
    });

    if (parent_id) {
      const edge = this.db.createEdge({
        id: uuidv4(),
        source_id: parent_id,
        target_id: agentNode.id,
        label: 'response',
      });
      this.broadcast({ type: 'edge_created', data: edge, requestId });
    }

    const agentName = this.db.getSetting('agent_name') || 'Claude';
    this.broadcast({
      type: 'claude_response',
      data: { node: agentNode, complete: true, agentName },
      requestId,
    });
  }

  /**
   * Handle Claude query: send question to Claude API, create AgentNode with response
   */
  private async handleClaudeQuery(
    ws: WebSocket,
    data: {
      question: string;
      parent_id?: string;
      context?: string;
      node_position?: { x: number; y: number };
      stream?: boolean;
    },
    requestId?: string
  ): Promise<void> {
    if (!this.anthropic) {
      this.sendError(ws, 'Claude API not configured. Set ANTHROPIC_API_KEY in environment.', requestId);
      return;
    }

    const { question, parent_id, context, node_position, stream: useStream = false } = data;

    try {
      // Get inherited context if parent_id is provided
      let fullContext = context || '';
      if (parent_id) {
        const inheritedContext = this.db.getInheritedContext(parent_id);
        fullContext = inheritedContext ? `${inheritedContext}\n\n${context || ''}` : context || '';
      }

      const systemMessage = fullContext
        ? `You are a helpful AI assistant. Here is the conversation context:\n\n${fullContext}`
        : 'You are a helpful AI assistant.';

      if (useStream) {
        const stream = await this.anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemMessage,
          messages: [{ role: 'user', content: question }],
        });

        let fullResponse = '';
        stream.on('text', (text) => {
          fullResponse += text;
          this.send(ws, {
            type: 'claude_streaming',
            data: { chunk: text, complete: false },
            requestId,
          });
        });

        await stream.finalMessage();
        await this.createAndBroadcastAgentNode(question, fullResponse, parent_id, node_position, requestId);
      } else {
        const message = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemMessage,
          messages: [{ role: 'user', content: question }],
        });

        const response = message.content[0].type === 'text' ? message.content[0].text : '';
        await this.createAndBroadcastAgentNode(question, response, parent_id, node_position, requestId);
      }
    } catch (error: any) {
      console.error('Claude API error:', error);
      this.sendError(ws, `Claude API error: ${error.message}`, requestId);
    }
  }

  /**
   * Handle Claude query scoped to a comment thread in a review node
   */
  private async handleCommentClaudeQuery(
    ws: WebSocket,
    data: {
      node_id: string;
      thread_id: string;
      selected_text: string;
      messages: { author: string; text: string }[];
    },
    requestId?: string
  ): Promise<void> {
    if (!this.anthropic) {
      this.sendError(ws, 'Claude API not configured. Set ANTHROPIC_API_KEY in environment.', requestId);
      return;
    }

    const { node_id, thread_id, selected_text, messages } = data;

    try {
      // Load the review node's context
      const node = this.db.getNode(node_id);
      const reviewContext = node?.context || '';

      // Build conversation messages for Claude
      const systemMessage = `You are reviewing code/text with a user. Here is the full review context:\n\n${reviewContext}\n\nThe user has highlighted the following text and is discussing it with you:\n\n"${selected_text}"`;

      const conversationMessages = messages.map((msg) => ({
        role: msg.author === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.text,
      }));

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemMessage,
        messages: conversationMessages,
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

      const commentAgentName = this.db.getSetting('agent_name') || 'Claude';
      this.send(ws, {
        type: 'comment_claude_response',
        data: {
          node_id,
          thread_id,
          agentName: commentAgentName,
          message: {
            id: `msg-${Date.now()}`,
            author: 'claude',
            text: responseText,
            createdAt: new Date().toISOString(),
          },
        },
        requestId,
      });
    } catch (error: any) {
      console.error('Comment Claude API error:', error);
      this.sendError(ws, `Claude API error: ${error.message}`, requestId);
    }
  }

  close(): void {
    this.clients.forEach((client) => client.close());
    this.wss.close();
  }
}
