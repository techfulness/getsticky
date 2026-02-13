# Frontend Integration Guide

Quick reference for connecting the React Flow frontend to the GetSticky backend.

## WebSocket Connection

```typescript
// Connect to the server
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('Connected to GetSticky server');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleServerMessage(message);
};
```

## Message Format

### Request Format
```typescript
interface WSMessage {
  type: 'create_node' | 'update_node' | 'delete_node' | 'create_edge' | 'delete_edge' | 'add_context' | 'search_context' | 'ask_claude';
  data: any;
  id?: string; // optional request ID for tracking
}
```

### Response Format
```typescript
interface WSResponse {
  type: 'success' | 'error' | 'node_created' | 'node_updated' | 'node_deleted' | 'edge_created' | 'edge_deleted' | 'context_added' | 'search_results' | 'initial_state' | 'claude_response' | 'claude_streaming';
  data?: any;
  error?: string;
  requestId?: string;
}
```

## Common Operations

### 1. Create a Node

```typescript
ws.send(JSON.stringify({
  type: 'create_node',
  data: {
    type: 'conversation', // or 'diagram', 'richtext', 'terminal'
    content: {
      question: 'How do I implement auth?',
      response: 'Here are the steps...'
    },
    context: 'User is building a React app with Node.js backend',
    parent_id: null // optional, for branching
  }
}));

// Response:
{
  type: 'node_created',
  data: {
    id: '123e4567-e89b-12d3-a456-426614174000',
    type: 'conversation',
    content: '{"question":"How do I implement auth?",...}',
    context: 'User is building a React app...',
    parent_id: null,
    created_at: '2026-02-12T01:00:00.000Z',
    updated_at: '2026-02-12T01:00:00.000Z'
  }
}
```

### 2. Update a Node

```typescript
ws.send(JSON.stringify({
  type: 'update_node',
  data: {
    id: 'node-id-here',
    content: {
      question: 'Updated question',
      response: 'Updated response'
    }
  }
}));
```

### 3. Delete a Node

```typescript
ws.send(JSON.stringify({
  type: 'delete_node',
  data: {
    id: 'node-id-here'
  }
}));
```

### 4. Create an Edge

```typescript
ws.send(JSON.stringify({
  type: 'create_edge',
  data: {
    source_id: 'source-node-id',
    target_id: 'target-node-id',
    label: 'optional label'
  }
}));
```

### 5. Add Context to Node

```typescript
ws.send(JSON.stringify({
  type: 'add_context',
  data: {
    node_id: 'node-id-here',
    text: 'Additional context information',
    source: 'user' // or 'agent', 'codebase', 'diagram'
  }
}));
```

### 6. Search Context (Semantic Search)

```typescript
ws.send(JSON.stringify({
  type: 'search_context',
  data: {
    query: 'authentication with JWT',
    limit: 5
  }
}));

// Response:
{
  type: 'search_results',
  data: [
    {
      nodeId: 'node-id-1',
      text: 'Context about JWT authentication...',
      source: 'agent',
      createdAt: '2026-02-12T01:00:00.000Z'
    },
    // ... more results
  ]
}
```

### 7. Ask Claude (NEW!)

Send a question to Claude API and automatically create an AgentNode with the response.

```typescript
ws.send(JSON.stringify({
  type: 'ask_claude',
  data: {
    question: 'How do I implement JWT authentication in Node.js?',
    parent_id: 'richtext-node-id',  // optional, for conversation branching
    context: 'User is building a React app with Express backend',  // optional
    node_position: { x: 100, y: 200 },  // optional, for React Flow positioning
    stream: false  // optional, set to true for streaming responses
  }
}));

// Non-streaming response:
{
  type: 'claude_response',
  data: {
    node: {
      id: 'new-agent-node-id',
      type: 'conversation',
      content: '{"question":"How do I...","response":"To implement JWT..."}',
      context: 'To implement JWT authentication...',
      parent_id: 'richtext-node-id',
      created_at: '2026-02-12T01:00:00.000Z',
      updated_at: '2026-02-12T01:00:00.000Z'
    },
    complete: true
  }
}

// If parent_id provided, an edge is automatically created:
{
  type: 'edge_created',
  data: {
    id: 'edge-id',
    source_id: 'richtext-node-id',
    target_id: 'new-agent-node-id',
    label: 'response'
  }
}

// Streaming response (stream: true):
// Multiple messages as response is generated
{
  type: 'claude_streaming',
  data: {
    chunk: 'To implement JWT authentication, you need to...',
    complete: false
  }
}

// Final message with complete node
{
  type: 'claude_response',
  data: {
    node: { /* full node data */ },
    complete: true
  }
}
```

**Features:**
- Automatic context inheritance from parent nodes
- Creates AgentNode with Claude's response
- Auto-creates edge from parent to response node
- Supports streaming for real-time display
- Full conversation context included

**Requirements:**
- `ANTHROPIC_API_KEY` must be set in server environment
- Returns error if API key not configured

## Node Types and Content Schemas

### Conversation Node
```typescript
{
  type: 'conversation',
  content: {
    question: string;
    response: string;
    metadata?: Record<string, unknown>;
  }
}
```

### Diagram Node
Diagram nodes are rendered as native React Flow nodes and edges on the canvas. No separate diagram library is needed — React Flow IS the diagramming tool. Claude creates nodes and connects them with edges to form architecture diagrams, flowcharts, etc.

```typescript
{
  type: 'diagram',
  content: {
    title?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }
}
```

### Rich Text Node
```typescript
{
  type: 'richtext',
  content: {
    tiptapJSON: Record<string, unknown>; // TipTap editor JSON
    plainText: string;
  }
}
```

### Terminal Node
```typescript
{
  type: 'terminal',
  content: {
    command: string;
    output: string;
    exitCode: number;
  }
}
```

## Event Handling

The server broadcasts changes to all connected clients:

```typescript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'initial_state':
      // Received on connection - full graph state
      setNodes(message.data.nodes);
      setEdges(message.data.edges);
      break;

    case 'node_created':
      // Another client created a node
      addNode(message.data);
      break;

    case 'node_updated':
      // Another client updated a node
      updateNode(message.data);
      break;

    case 'node_deleted':
      // Another client deleted a node
      removeNode(message.data.id);
      break;

    case 'edge_created':
      // Another client created an edge
      addEdge(message.data);
      break;

    case 'edge_deleted':
      // Another client deleted an edge
      removeEdge(message.data.id);
      break;

    case 'context_added':
      // Context was added to a node
      refreshNode(message.data.node_id);
      break;

    case 'error':
      // Error occurred
      console.error('Server error:', message.error);
      break;
  }
};
```

## React Hook Example

```typescript
import { useEffect, useRef, useState } from 'react';

export function useGetStickyWS() {
  const ws = useRef<WebSocket | null>(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8080');

    ws.current.onopen = () => {
      setConnected(true);
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'initial_state':
          setNodes(message.data.nodes);
          setEdges(message.data.edges);
          break;

        case 'node_created':
          setNodes(prev => [...prev, message.data]);
          break;

        case 'node_updated':
          setNodes(prev => prev.map(n =>
            n.id === message.data.id ? message.data : n
          ));
          break;

        case 'node_deleted':
          setNodes(prev => prev.filter(n => n.id !== message.data.id));
          break;

        case 'edge_created':
          setEdges(prev => [...prev, message.data]);
          break;

        case 'edge_deleted':
          setEdges(prev => prev.filter(e => e.id !== message.data.id));
          break;
      }
    };

    ws.current.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const createNode = (nodeData: any) => {
    ws.current?.send(JSON.stringify({
      type: 'create_node',
      data: nodeData
    }));
  };

  const updateNode = (id: string, updates: any) => {
    ws.current?.send(JSON.stringify({
      type: 'update_node',
      data: { id, ...updates }
    }));
  };

  const deleteNode = (id: string) => {
    ws.current?.send(JSON.stringify({
      type: 'delete_node',
      data: { id }
    }));
  };

  const createEdge = (edgeData: any) => {
    ws.current?.send(JSON.stringify({
      type: 'create_edge',
      data: edgeData
    }));
  };

  return {
    nodes,
    edges,
    connected,
    createNode,
    updateNode,
    deleteNode,
    createEdge,
  };
}
```

## Usage in React Flow

```typescript
import { ReactFlow } from '@xyflow/react';
import { useGetStickyWS } from './hooks/useGetStickyWS';

function App() {
  const { nodes, edges, createNode, createEdge } = useGetStickyWS();

  // Convert DB nodes to React Flow nodes
  const flowNodes = nodes.map(node => ({
    id: node.id,
    type: node.type,
    data: JSON.parse(node.content),
    position: { x: 0, y: 0 }, // You'll need to store positions
  }));

  // Convert DB edges to React Flow edges
  const flowEdges = edges.map(edge => ({
    id: edge.id,
    source: edge.source_id,
    target: edge.target_id,
    label: edge.label,
  }));

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
    />
  );
}
```

## Environment Setup

Make sure the backend server is running:

```bash
cd server
npm run dev
```

The WebSocket server will be available at `ws://localhost:8080`.

For production, use environment variables:

```typescript
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const ws = new WebSocket(WS_URL);
```

## Error Handling

```typescript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  if (!event.wasClean) {
    console.error('Connection lost, attempting to reconnect...');
    setTimeout(connectWebSocket, 3000);
  }
};
```

## Next Steps

1. Implement the WebSocket hook in your React app
2. Create node type components (AgentNode, RichTextNode, etc.)
3. Connect React Flow events to WebSocket messages
4. Add position persistence (store x,y in node data)
5. Implement branching UI (button to create child nodes)
