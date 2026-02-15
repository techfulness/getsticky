#!/usr/bin/env node

/**
 * GetSticky MCP Server
 * Provides Model Context Protocol tools for Claude Code to interact with the node graph
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { initDB } from '../db/index.js';
import type { DatabaseManager } from '../db/index.js';
import { HttpNotificationClient } from '../notifications/http-client.js';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import Dagre from '@dagrejs/dagre';

// Load environment variables
dotenv.config();

// Database instance
let db: DatabaseManager;

// List layout constants — must match frontend ListNode.tsx
const LIST_ITEM_HEIGHT = 200;
const LIST_GAP = 12;
const LIST_PADDING = 16;
const LIST_HEADER_HEIGHT = 48;
const LIST_ITEM_WIDTH = 200;

/** Compute the slot position for a list child at a given order index */
function listSlotPosition(order: number): { x: number; y: number } {
  return {
    x: LIST_PADDING,
    y: LIST_HEADER_HEIGHT + LIST_PADDING + order * (LIST_ITEM_HEIGHT + LIST_GAP),
  };
}

/** Reflow a list's children: sort by current order then reassign sequential orders + positions */
async function reflowListChildren(listId: string) {
  const children = db.getChildNodes(listId)
    .map((c) => ({ node: c, content: JSON.parse(c.content) }))
    .sort((a, b) => (a.content.order ?? 999) - (b.content.order ?? 999));

  for (let i = 0; i < children.length; i++) {
    const { node, content } = children[i];
    content.order = i;
    content.position = listSlotPosition(i);
    await db.updateNode(node.id, { content: JSON.stringify(content) });
  }
}

/** Compute default width/height for a node type (shared by layout tools) */
function getNodeDimensions(
  type: string,
  content: any,
  defaultWidth = 300,
  defaultHeight = 180,
): { w: number; h: number } {
  if (type === 'container') {
    return { w: content.width || 600, h: content.height || 400 };
  }
  if (type === 'richtext') return { w: content.width || 400, h: 300 };
  if (type === 'diagramBox') return { w: 180, h: 80 };
  if (type === 'stickyNote') return { w: 200, h: 200 };
  if (type === 'list') return { w: 232, h: 300 }; // 232 = 16*2 + 200 (padding + item width)
  return { w: defaultWidth, h: defaultHeight };
}

/** Find a position on the canvas that doesn't overlap existing nodes.
 *  Scans all top-level nodes on the board and places the new node to the
 *  right of the rightmost one with comfortable spacing. */
function findFreePosition(
  boardId: string,
  newWidth: number,
  newHeight: number,
): { x: number; y: number } {
  const allNodes = db.getAllNodes(boardId);
  if (allNodes.length === 0) return { x: 100, y: 100 };

  // Collect bounding boxes of all top-level nodes (skip list children)
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (const n of allNodes) {
    if (n.parent_id) continue;
    const content = JSON.parse(n.content);
    const pos = content.position;
    if (!pos) continue;
    const { w, h } = getNodeDimensions(n.type, content);
    boxes.push({ x: pos.x, y: pos.y, w, h });
  }

  if (boxes.length === 0) return { x: 100, y: 100 };

  const SPACING = 80;

  // Place to the right of the rightmost node, vertically aligned with the top-most
  const maxRight = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));

  return { x: maxRight + SPACING, y: minY };
}

/** Validate that required fields exist in args, returning an error response or null */
function validateArgs(
  args: Record<string, unknown>,
  required: string[],
): { content: [{ type: 'text'; text: string }]; isError: true } | null {
  const missing = required.filter((key) => args[key] === undefined || args[key] === null);
  if (missing.length > 0) {
    return {
      content: [{ type: 'text', text: `Missing required arguments: ${missing.join(', ')}` }],
      isError: true,
    };
  }
  return null;
}

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'create_board',
    description: 'Create a new board for organizing nodes',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Board name',
        },
        id: {
          type: 'string',
          description: 'Optional board ID (auto-generated if not provided)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_board',
    description: 'Delete a board and all its nodes, edges, and contexts. Cannot delete the default board.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Board ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_boards',
    description: 'List all boards',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_node',
    description: 'Create a new node on the canvas (conversation, diagram, richtext, or terminal)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['conversation', 'diagram', 'diagramBox', 'container', 'richtext', 'terminal', 'stickyNote', 'list'],
          description: 'Type of node to create',
        },
        content: {
          type: 'object',
          description: 'Node content (varies by type)',
        },
        context: {
          type: 'string',
          description: 'Context information for this node',
        },
        parent_id: {
          type: 'string',
          description: 'Parent node ID (for branching conversations)',
        },
        board_id: {
          type: 'string',
          description: 'Board ID (defaults to "default")',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'get_node',
    description: 'Get a specific node by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Node ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_node',
    description: 'Update an existing node',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Node ID to update',
        },
        content: {
          type: 'object',
          description: 'Updated content',
        },
        context: {
          type: 'string',
          description: 'Updated context',
        },
        parent_id: {
          type: ['string', 'null'],
          description: 'New parent node ID (set to null to detach from parent)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the canvas',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Node ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_edge',
    description: 'Create a connection between two nodes',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'Source node ID',
        },
        target_id: {
          type: 'string',
          description: 'Target node ID',
        },
        label: {
          type: 'string',
          description: 'Optional label for the edge',
        },
      },
      required: ['source_id', 'target_id'],
    },
  },
  {
    name: 'branch_conversation',
    description: 'Create a new conversation branch from an existing node (inherits context)',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: {
          type: 'string',
          description: 'Parent node ID to branch from',
        },
        type: {
          type: 'string',
          enum: ['conversation', 'diagram', 'diagramBox', 'container', 'richtext', 'terminal', 'stickyNote', 'list'],
          description: 'Type of the new branch node',
        },
        content: {
          type: 'object',
          description: 'Content for the new branch',
        },
        board_id: {
          type: 'string',
          description: 'Board ID (defaults to "default")',
        },
      },
      required: ['parent_id', 'type', 'content'],
    },
  },
  {
    name: 'add_context',
    description: 'Add context information to a node',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'Node ID',
        },
        text: {
          type: 'string',
          description: 'Context text to add',
        },
        source: {
          type: 'string',
          enum: ['user', 'agent', 'codebase', 'diagram'],
          description: 'Source of the context',
        },
      },
      required: ['node_id', 'text', 'source'],
    },
  },
  {
    name: 'get_context',
    description: 'Get context for a specific node (including inherited context)',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'Node ID',
        },
        include_inherited: {
          type: 'boolean',
          description: 'Include inherited context from parent nodes',
          default: true,
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'search_context',
    description: 'Semantic search across all node contexts',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 5,
        },
        board_id: {
          type: 'string',
          description: 'Board ID to scope search (defaults to all boards)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_conversation_path',
    description: 'Get the full conversation path from root to a specific node',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'Node ID',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'get_all_nodes',
    description: 'Get all nodes on the canvas',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['conversation', 'diagram', 'diagramBox', 'container', 'richtext', 'terminal', 'stickyNote', 'list'],
          description: 'Filter by node type (optional)',
        },
        board_id: {
          type: 'string',
          description: 'Board ID to filter by (defaults to all boards)',
        },
      },
    },
  },
  {
    name: 'export_graph',
    description: 'Export the entire graph (nodes and edges) for visualization',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'string',
          description: 'Board ID to export (defaults to all boards)',
        },
      },
    },
  },
  {
    name: 'get_stats',
    description: 'Get database statistics (node counts, context stats, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'string',
          description: 'Board ID to get stats for (defaults to all boards)',
        },
      },
    },
  },
  {
    name: 'get_canvas_layout',
    description: 'Get all nodes with their positions and types, plus overlap/spacing analysis. Use this to verify diagram layout looks good without needing screenshots.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'string',
          description: 'Board ID to get layout for (defaults to all boards)',
        },
      },
    },
  },
  {
    name: 'move_node',
    description: 'Move a node to a new position on the canvas',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Node ID to move',
        },
        x: {
          type: 'number',
          description: 'New X position',
        },
        y: {
          type: 'number',
          description: 'New Y position',
        },
      },
      required: ['id', 'x', 'y'],
    },
  },
  {
    name: 'create_review',
    description: 'Create a richtext node in review mode on the canvas. The user can select text and add comment threads, discuss with Claude, then resolve. Use get_review_summary to read back their feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Review title (e.g., "Code Review: auth.ts")',
        },
        content: {
          type: 'string',
          description: 'Markdown review text content',
        },
        context: {
          type: 'string',
          description: 'Full codebase context embedded in the node so comment threads have it',
        },
        board_id: {
          type: 'string',
          description: 'Board ID (defaults to "default")',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'get_review_summary',
    description: 'Read a review node and format all comment threads into a readable markdown summary. Call this when the user says they are done reviewing.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'Review node ID to summarize',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'arrange_nodes',
    description: 'Auto-arrange all nodes in a clean layout with proper spacing. Optionally specify layout direction and spacing.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['TB', 'LR'],
          description: 'Layout direction: TB (top-to-bottom) or LR (left-to-right). Default: TB',
        },
        spacing_x: {
          type: 'number',
          description: 'Horizontal spacing between nodes in pixels. Default: 50',
        },
        spacing_y: {
          type: 'number',
          description: 'Vertical spacing between nodes in pixels. Default: 80',
        },
        node_width: {
          type: 'number',
          description: 'Assumed node width in pixels. Default: 300',
        },
        node_height: {
          type: 'number',
          description: 'Assumed node height in pixels. Default: 180',
        },
        board_id: {
          type: 'string',
          description: 'Board ID to arrange (defaults to all boards)',
        },
      },
    },
  },
  {
    name: 'get_list_items',
    description: 'Get all items (child nodes) of a list, sorted by order. Returns sticky notes and richtext nodes that belong to the list.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: {
          type: 'string',
          description: 'The list node ID to get items from',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'done'],
          description: 'Optional: filter items by status',
        },
      },
      required: ['list_id'],
    },
  },
  {
    name: 'update_list_item_status',
    description: 'Update the status of a list item (todo, in-progress, done)',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The item (child node) ID to update',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'done'],
          description: 'New status for the item',
        },
      },
      required: ['item_id', 'status'],
    },
  },
  {
    name: 'add_list_item',
    description: 'Add a new sticky note item to a list at the next order position',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: {
          type: 'string',
          description: 'The list node ID to add the item to',
        },
        text: {
          type: 'string',
          description: 'Text content for the new sticky note item',
        },
        color: {
          type: 'string',
          description: 'Color of the sticky note (default: yellow)',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'done'],
          description: 'Initial status (default: todo)',
        },
      },
      required: ['list_id', 'text'],
    },
  },
  {
    name: 'move_to_list',
    description: 'Move a node into a list (or detach from its current list by passing null). Handles reparenting and position reflow.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'The node ID to move',
        },
        target_list_id: {
          type: ['string', 'null'],
          description: 'Target list ID to move into, or null to detach from current list',
        },
      },
      required: ['node_id', 'target_list_id'],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'getsticky-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const a = (args || {}) as Record<string, unknown>;

    switch (name) {
      case 'create_board': {
        const err = validateArgs(a, ['name']);
        if (err) return err;
        const { name: boardName, id: boardId } = a as any;
        const board = db.createBoard(boardId || uuidv4(), boardName);
        return {
          content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
        };
      }

      case 'delete_board': {
        const err = validateArgs(a, ['id']);
        if (err) return err;
        const { id } = a as any;
        const success = await db.deleteBoard(id);
        return {
          content: [{ type: 'text', text: success ? `Deleted board: ${id}` : `Board not found: ${id}` }],
        };
      }

      case 'list_boards': {
        const boards = db.getAllBoards();
        return {
          content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }],
        };
      }

      case 'create_node': {
        const err = validateArgs(a, ['type', 'content']);
        if (err) return err;
        const { type, content, context, parent_id, board_id } = a as any;
        // Assign a non-overlapping position when the caller didn't provide one
        if (!content.position && !parent_id) {
          const bId = board_id || 'default';
          const dims = getNodeDimensions(type, content);
          content.position = findFreePosition(bId, dims.w, dims.h);
        }
        const node = await db.createNode({
          id: uuidv4(),
          type,
          content: JSON.stringify(content),
          context: context || '',
          parent_id: parent_id || null,
          board_id: board_id || 'default',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(node, null, 2),
            },
          ],
        };
      }

      case 'get_node': {
        const err = validateArgs(a, ['id']);
        if (err) return err;
        const { id } = a as any;
        const node = db.getNode(id);

        if (!node) {
          return {
            content: [
              {
                type: 'text',
                text: `Node not found: ${id}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(node, null, 2),
            },
          ],
        };
      }

      case 'update_node': {
        const err = validateArgs(a, ['id']);
        if (err) return err;
        const { id, content, context, parent_id } = a as any;
        const updates: any = {};

        if (content) updates.content = JSON.stringify(content);
        if (context) updates.context = context;
        if (parent_id !== undefined) updates.parent_id = parent_id;

        const node = await db.updateNode(id, updates);

        if (!node) {
          return {
            content: [
              {
                type: 'text',
                text: `Node not found: ${id}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(node, null, 2),
            },
          ],
        };
      }

      case 'delete_node': {
        const err = validateArgs(a, ['id']);
        if (err) return err;
        const { id } = a as any;
        const success = await db.deleteNode(id);

        return {
          content: [
            {
              type: 'text',
              text: success ? `Deleted node: ${id}` : `Node not found: ${id}`,
            },
          ],
        };
      }

      case 'create_edge': {
        const err = validateArgs(a, ['source_id', 'target_id']);
        if (err) return err;
        const { source_id, target_id, label } = a as any;
        const edge = db.createEdge({
          id: uuidv4(),
          source_id,
          target_id,
          label: label || null,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(edge, null, 2),
            },
          ],
        };
      }

      case 'branch_conversation': {
        const err = validateArgs(a, ['parent_id', 'type', 'content']);
        if (err) return err;
        const { parent_id, type, content } = a as any;
        const node = await db.branchNode(parent_id, {
          id: uuidv4(),
          type,
          content: JSON.stringify(content),
        });

        if (!node) {
          return {
            content: [
              {
                type: 'text',
                text: `Parent node not found: ${parent_id}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(node, null, 2),
            },
          ],
        };
      }

      case 'add_context': {
        const err = validateArgs(a, ['node_id', 'text', 'source']);
        if (err) return err;
        const { node_id, text, source } = a as any;
        await db.addContext(node_id, text, source);

        return {
          content: [
            {
              type: 'text',
              text: `Added context to node: ${node_id}`,
            },
          ],
        };
      }

      case 'get_context': {
        const err = validateArgs(a, ['node_id']);
        if (err) return err;
        const { node_id, include_inherited = true } = a as any;
        const context = include_inherited
          ? db.getInheritedContext(node_id)
          : db.getContextForNode(node_id);

        return {
          content: [
            {
              type: 'text',
              text: context || 'No context found',
            },
          ],
        };
      }

      case 'search_context': {
        const err = validateArgs(a, ['query']);
        if (err) return err;
        const { query, limit = 5, board_id } = a as any;
        const results = await db.searchContext(query, limit, board_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_conversation_path': {
        const err = validateArgs(a, ['node_id']);
        if (err) return err;
        const { node_id } = a as any;
        const path = db.getConversationPath(node_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(path, null, 2),
            },
          ],
        };
      }

      case 'get_all_nodes': {
        const { type, board_id } = a as any;
        let nodes = db.getAllNodes(board_id);

        if (type) {
          nodes = nodes.filter((n) => n.type === type);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(nodes, null, 2),
            },
          ],
        };
      }

      case 'export_graph': {
        const { board_id } = a as any;
        const graph = db.exportGraph(board_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(graph, null, 2),
            },
          ],
        };
      }

      case 'get_stats': {
        const { board_id } = a as any;
        const stats = await db.getStats(board_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case 'get_canvas_layout': {
        console.error('[MCP] get_canvas_layout');
        const { board_id: layoutBoardId } = a as any;
        const allNodes = db.getAllNodes(layoutBoardId);
        const allEdges = db.getAllEdges(layoutBoardId);

        if (allNodes.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  nodes: [],
                  edges: 0,
                  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
                  overlaps: 'none',
                  total: 0,
                }, null, 2),
              },
            ],
          };
        }

        // Parse positions from content
        const nodeLayouts = allNodes.map((n: any) => {
          const content = JSON.parse(n.content);
          const { w, h } = getNodeDimensions(n.type, content);
          const layout: any = {
            id: n.id,
            type: n.type,
            title: content.title || content.question || content.text || '(untitled)',
            x: content.position?.x ?? 0,
            y: content.position?.y ?? 0,
            width: w,
            height: h,
            parent_id: n.parent_id || null,
          };
          if (n.type === 'stickyNote' && content.color) {
            layout.color = content.color;
          }
          return layout;
        });

        // Detect overlaps
        const overlaps: string[] = [];
        for (let i = 0; i < nodeLayouts.length; i++) {
          for (let j = i + 1; j < nodeLayouts.length; j++) {
            const a = nodeLayouts[i];
            const b = nodeLayouts[j];
            if (
              a.x < b.x + b.width &&
              a.x + a.width > b.x &&
              a.y < b.y + b.height &&
              a.y + a.height > b.y
            ) {
              overlaps.push(`"${a.title}" overlaps with "${b.title}"`);
            }
          }
        }

        // Compute bounding box
        const minX = Math.min(...nodeLayouts.map((n: any) => n.x));
        const minY = Math.min(...nodeLayouts.map((n: any) => n.y));
        const maxX = Math.max(...nodeLayouts.map((n: any) => n.x + n.width));
        const maxY = Math.max(...nodeLayouts.map((n: any) => n.y + n.height));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                nodes: nodeLayouts,
                edges: allEdges.length,
                bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
                overlaps: overlaps.length > 0 ? overlaps : 'none',
                total: nodeLayouts.length,
              }, null, 2),
            },
          ],
        };
      }

      case 'move_node': {
        const err = validateArgs(a, ['id', 'x', 'y']);
        if (err) return err;
        console.error(`[MCP] move_node ${a.id}`);
        const { id, x, y } = a as any;
        const nodeToMove = db.getNode(id);

        if (!nodeToMove) {
          return {
            content: [{ type: 'text', text: `Node not found: ${id}` }],
            isError: true,
          };
        }

        const content = JSON.parse(nodeToMove.content);
        content.position = { x, y };
        await db.updateNode(id, { content: JSON.stringify(content) });

        return {
          content: [
            {
              type: 'text',
              text: `Moved "${content.title || id}" to (${x}, ${y})`,
            },
          ],
        };
      }

      case 'create_review': {
        const err = validateArgs(a, ['title', 'content']);
        if (err) return err;
        console.error('[MCP] create_review');
        const { title, content: reviewContent, context: reviewContext, board_id: reviewBoardId } = a as any;
        const bId = reviewBoardId || 'default';
        const reviewDims = getNodeDimensions('richtext', { width: 800 });
        const reviewPos = findFreePosition(bId, reviewDims.w, reviewDims.h);

        const reviewNode = await db.createNode({
          id: uuidv4(),
          type: 'richtext',
          content: JSON.stringify({
            plainText: reviewContent,
            title,
            isReview: true,
            comments: [],
            position: reviewPos,
            width: 800,
            focusOnCreate: true,
          }),
          context: reviewContext || '',
          parent_id: null,
          board_id: reviewBoardId || 'default',
        });

        // Node is persisted in DB. Frontend will pick it up on next
        // WebSocket connection or when the user refreshes the canvas.

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ id: reviewNode.id, title, message: 'Review node created in DB. Refresh the canvas or reconnect to see it.' }, null, 2),
            },
          ],
        };
      }

      case 'get_review_summary': {
        const err = validateArgs(a, ['node_id']);
        if (err) return err;
        console.error(`[MCP] get_review_summary ${a.node_id}`);
        const { node_id } = a as any;
        const reviewNode = db.getNode(node_id);

        if (!reviewNode) {
          return {
            content: [{ type: 'text', text: `Review node not found: ${node_id}` }],
            isError: true,
          };
        }

        const parsedContent = JSON.parse(reviewNode.content);
        const threads: any[] = parsedContent.comments || [];

        let summary = `# Review Summary: ${parsedContent.title || 'Untitled Review'}\n\n`;
        summary += `## Review Text\n\n${parsedContent.plainText}\n\n`;

        if (threads.length === 0) {
          summary += '## Comments\n\nNo comments were made.\n';
        } else {
          summary += `## Comments (${threads.length} threads)\n\n`;

          for (const thread of threads) {
            const statusIcon = thread.status === 'resolved' ? '[RESOLVED]' : '[OPEN]';
            summary += `### ${statusIcon} Comment on: "${thread.selectedText}"\n\n`;

            for (const msg of thread.messages) {
              const authorLabel = msg.author === 'claude' ? 'Claude' : 'User';
              summary += `**${authorLabel}:** ${msg.text}\n\n`;
            }

            summary += '---\n\n';
          }
        }

        return {
          content: [{ type: 'text', text: summary }],
        };
      }

      case 'arrange_nodes': {
        console.error('[MCP] arrange_nodes');
        const {
          direction = 'TB',
          spacing_x = 60,
          spacing_y = 100,
          node_width = 300,
          node_height = 180,
          board_id: arrangeBoardId,
        } = a as any;

        const allNodesForLayout = db.getAllNodes(arrangeBoardId);
        const allEdgesForLayout = db.getAllEdges(arrangeBoardId);

        // Build a set of container node IDs
        const containerIds = new Set(
          allNodesForLayout.filter((n: any) => n.type === 'container').map((n: any) => n.id)
        );

        // Skip nodes that are children of a container (they have relative positions)
        const topLevelNodes = allNodesForLayout.filter(
          (n: any) => !n.parent_id || !containerIds.has(n.parent_id)
        );

        // Use dagre for proper hierarchical graph layout
        const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        g.setGraph({
          rankdir: direction,
          nodesep: spacing_x,
          ranksep: spacing_y,
          marginx: 20,
          marginy: 20,
        });

        // Add only top-level nodes to dagre graph
        for (const node of topLevelNodes) {
          const content = JSON.parse(node.content);
          const { w, h } = getNodeDimensions(node.type, content, node_width, node_height);
          g.setNode(node.id, { width: w, height: h });
        }

        // Add edges (only between top-level nodes)
        const topLevelIds = new Set(topLevelNodes.map((n: any) => n.id));
        for (const edge of allEdgesForLayout) {
          if (topLevelIds.has(edge.source_id) && topLevelIds.has(edge.target_id)) {
            g.setEdge(edge.source_id, edge.target_id);
          }
        }

        // Run dagre layout
        Dagre.layout(g);

        // Apply computed positions back to top-level nodes
        const updates: { id: string; title: string; x: number; y: number }[] = [];

        for (const node of topLevelNodes) {
          const pos = g.node(node.id);
          if (!pos) continue;

          const content = JSON.parse(node.content);
          const { w, h } = getNodeDimensions(node.type, content, node_width, node_height);

          // Dagre returns center positions; convert to top-left for React Flow
          const x = pos.x - w / 2;
          const y = pos.y - h / 2;

          content.position = { x, y };
          await db.updateNode(node.id, { content: JSON.stringify(content) });
          updates.push({ id: node.id, title: content.title || content.label || node.id, x, y });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                arranged: updates.length,
                direction,
                positions: updates,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_list_items': {
        const err = validateArgs(a, ['list_id']);
        if (err) return err;
        const { list_id, status: statusFilter } = a as any;

        const listNode = db.getNode(list_id);
        if (!listNode || listNode.type !== 'list') {
          return {
            content: [{ type: 'text', text: `List node not found: ${list_id}` }],
            isError: true,
          };
        }

        let children = db.getChildNodes(list_id);
        // Parse content and sort by order
        const items = children.map((child) => {
          const content = JSON.parse(child.content);
          return {
            id: child.id,
            type: child.type,
            text: content.text || content.plainText || content.title || '',
            order: content.order ?? 999,
            status: content.status || 'todo',
            color: content.color,
          };
        }).sort((a, b) => a.order - b.order);

        const filtered = statusFilter
          ? items.filter((item) => item.status === statusFilter)
          : items;

        return {
          content: [{ type: 'text', text: JSON.stringify({ list_id, title: JSON.parse(listNode.content).title, items: filtered }, null, 2) }],
        };
      }

      case 'update_list_item_status': {
        const err = validateArgs(a, ['item_id', 'status']);
        if (err) return err;
        const { item_id, status: newStatus } = a as any;

        const item = db.getNode(item_id);
        if (!item) {
          return {
            content: [{ type: 'text', text: `Item not found: ${item_id}` }],
            isError: true,
          };
        }

        const content = JSON.parse(item.content);
        content.status = newStatus;
        await db.updateNode(item_id, { content: JSON.stringify(content) });

        return {
          content: [{ type: 'text', text: `Updated item "${content.text || item_id}" status to: ${newStatus}` }],
        };
      }

      case 'add_list_item': {
        const err = validateArgs(a, ['list_id', 'text']);
        if (err) return err;
        const { list_id, text: itemText, color = 'yellow', status: itemStatus = 'todo' } = a as any;

        const listNode = db.getNode(list_id);
        if (!listNode || listNode.type !== 'list') {
          return {
            content: [{ type: 'text', text: `List node not found: ${list_id}` }],
            isError: true,
          };
        }

        // Determine next order position
        const existingChildren = db.getChildNodes(list_id);
        const maxOrder = existingChildren.reduce((max, child) => {
          const c = JSON.parse(child.content);
          return Math.max(max, c.order ?? 0);
        }, -1);

        const order = maxOrder + 1;

        const newItem = await db.createNode({
          id: uuidv4(),
          type: 'stickyNote',
          content: JSON.stringify({
            text: itemText,
            color,
            order,
            status: itemStatus,
            position: listSlotPosition(order),
            width: LIST_ITEM_WIDTH,
          }),
          context: '',
          parent_id: list_id,
          board_id: listNode.board_id,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(newItem, null, 2) }],
        };
      }

      case 'move_to_list': {
        const err = validateArgs(a, ['node_id', 'target_list_id']);
        if (err) return err;
        const { node_id: moveNodeId, target_list_id: targetListId } = a as any;

        const moveNode = db.getNode(moveNodeId);
        if (!moveNode) {
          return { content: [{ type: 'text', text: `Node not found: ${moveNodeId}` }], isError: true };
        }

        const oldParentId = moveNode.parent_id;

        if (targetListId) {
          // Move INTO a list
          const targetList = db.getNode(targetListId);
          if (!targetList || targetList.type !== 'list') {
            return { content: [{ type: 'text', text: `Target list not found: ${targetListId}` }], isError: true };
          }

          const targetChildren = db.getChildNodes(targetListId);
          const nextOrder = targetChildren.length;

          // Update content with new order and position
          const nodeContent = JSON.parse(moveNode.content);
          nodeContent.order = nextOrder;
          nodeContent.position = listSlotPosition(nextOrder);

          const updated = await db.updateNode(moveNodeId, {
            parent_id: targetListId,
            content: JSON.stringify(nodeContent),
          });

          // Reflow old parent's children if node was in a different list
          if (oldParentId && oldParentId !== targetListId) {
            await reflowListChildren(oldParentId);
          }

          return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
        } else {
          // Detach from list (set parent_id to null)
          const updated = await db.updateNode(moveNodeId, { parent_id: null });

          // Reflow old parent's remaining children to fill the gap
          if (oldParentId) {
            await reflowListChildren(oldParentId);
          }

          return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
        }
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  console.error('Initializing GetSticky MCP Server...');

  // Initialize database
  db = await initDB(process.env.DB_PATH);
  console.error('Database initialized');

  // Wire up cross-process notifications: DB mutations → HTTP POST → WS server → frontends
  const notifier = new HttpNotificationClient(process.env.WS_SERVER_URL);
  db.on('mutation', (payload) => notifier.publish(payload));
  console.error(`Notifications targeting ${process.env.WS_SERVER_URL || 'http://localhost:8080'}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('GetSticky MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
