import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  PanOnScrollMode,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Connection,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ExampleNode from './nodes/ExampleNode';
import AgentNode from './nodes/AgentNode';
import RichTextNode from './nodes/RichTextNode';
import DiagramNode from './nodes/DiagramNode';
import DiagramBoxNode from './nodes/DiagramBoxNode';
import ContainerNode from './nodes/ContainerNode';
import TerminalNode from './nodes/TerminalNode';
import StickyNoteNode from './nodes/StickyNoteNode';
import NodeErrorBoundary from './components/NodeErrorBoundary';
import { getAPI } from './lib/api';
import { APIProvider } from './contexts/APIContext';
import CanvasToolbar, { type ToolItem } from './components/CanvasToolbar';
import './App.css';

// Wrap each node component in an error boundary so one crash doesn't take down the canvas
function withErrorBoundary<P extends { id: string }>(
  WrappedComponent: React.ComponentType<P>,
): React.ComponentType<P> {
  const Wrapper = (props: P) => (
    <NodeErrorBoundary nodeId={props.id}>
      <WrappedComponent {...props} />
    </NodeErrorBoundary>
  );
  Wrapper.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return Wrapper;
}

const nodeTypes: NodeTypes = {
  exampleNode: withErrorBoundary(ExampleNode),
  agentNode: withErrorBoundary(AgentNode),
  richTextNode: withErrorBoundary(RichTextNode),
  diagramNode: withErrorBoundary(DiagramNode),
  diagramBox: withErrorBoundary(DiagramBoxNode),
  containerNode: withErrorBoundary(ContainerNode as any),
  terminalNode: withErrorBoundary(TerminalNode),
  stickyNoteNode: withErrorBoundary(StickyNoteNode),
};

const nodeTypeMap: Record<string, string> = {
  conversation: 'agentNode',
  richtext: 'richTextNode',
  diagram: 'diagramNode',
  diagramBox: 'diagramBox',
  container: 'containerNode',
  terminal: 'terminalNode',
  stickyNote: 'stickyNoteNode',
};

// React Flow requires parent nodes to appear before children in the array
function sortNodesParentFirst(nodes: Node[]): Node[] {
  const parentIds = new Set(nodes.filter((n) => n.type === 'containerNode').map((n) => n.id));
  const parents: Node[] = [];
  const children: Node[] = [];
  const rest: Node[] = [];

  for (const node of nodes) {
    if (parentIds.has(node.id)) {
      parents.push(node);
    } else if (node.parentId && parentIds.has(node.parentId)) {
      children.push(node);
    } else {
      rest.push(node);
    }
  }

  return [...parents, ...rest, ...children];
}

// Convert a DB node to a React Flow node, applying container parent-child relationships
function dbNodeToFlowNode(dbNode: any, allDbNodes?: any[]): Node {
  const content = typeof dbNode.content === 'string' ? JSON.parse(dbNode.content) : dbNode.content;
  const flowType = nodeTypeMap[dbNode.type] || 'agentNode';

  const node: Node = {
    id: dbNode.id,
    type: flowType,
    position: content.position || { x: Math.random() * 500 + 200, y: Math.random() * 300 + 200 },
    data: content,
  };

  // Container nodes get explicit dimensions
  if (flowType === 'containerNode') {
    node.style = {
      width: content.width || 600,
      height: content.height || 400,
    };
  }

  // If this node has a parent that is a container, set up grouping
  if (dbNode.parent_id && allDbNodes) {
    const parent = allDbNodes.find((n: any) => n.id === dbNode.parent_id);
    if (parent && parent.type === 'container') {
      node.parentId = dbNode.parent_id;
      node.extent = 'parent';
      node.expandParent = true;
    }
  }

  return node;
}

// Initial demo nodes
const demoNodes: Node[] = [
  {
    id: 'question-1',
    type: 'richTextNode',
    position: { x: 100, y: 200 },
    data: {
      content: '',
      placeholder: 'Ask Claude about your codebase...',
    },
  },
];

const demoEdges: Edge[] = [];

function AppContent() {
  const [nodes, setNodes] = useState<Node[]>(demoNodes);
  const [edges, setEdges] = useState<Edge[]>(demoEdges);
  const apiRef = useRef(getAPI());
  const [isConnected, setIsConnected] = useState(false);
  const [agentName, setAgentName] = useState('Claude');
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const agentNameRef = useRef(agentName);

  // Feature 3: Click-to-place
  const [activeTool, setActiveTool] = useState<ToolItem | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Feature 5: Selection tracking for contextual menu
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);

  // Feature 4: Copy/paste
  const copiedNodesRef = useRef<Node[]>([]);
  const pasteCountRef = useRef(0);

  // Connect to WebSocket on mount
  useEffect(() => {
    const api = apiRef.current;

    // Connect to backend
    api.connect().then(() => {
      console.log('[App] Connected to backend');
      setIsConnected(true);

      // Request settings (initial state arrives automatically on WS connect)
      api.getSettings();
    }).catch((error) => {
      console.error('[App] Failed to connect:', error);
    });

    // Handle node_created events
    const unsubNodeCreated = api.on('node_created', (data: any) => {
      console.log('[App] node_created:', data);

      const dbNode = data.data;

      setNodes((prev) => {
        // Build a minimal allDbNodes-like array so parent lookup works
        // We need to check if the parent is already in our nodes list
        const existingAsDb = prev.map((n) => ({
          id: n.id,
          type: n.type === 'containerNode' ? 'container' : n.type,
        }));
        const newNode = dbNodeToFlowNode(dbNode, [...existingAsDb, dbNode]);
        return sortNodesParentFirst([...prev, newNode]);
      });
    });

    // Handle node_updated events
    const unsubNodeUpdated = api.on('node_updated', (data: any) => {
      console.log('[App] node_updated:', data);

      // The WS server broadcasts the full DB node — parse content JSON
      const dbNode = data.data || data;
      const updatedContent = typeof dbNode.content === 'string'
        ? JSON.parse(dbNode.content)
        : dbNode.content;

      setNodes((prev) =>
        prev.map((node) =>
          node.id === dbNode.id
            ? {
                ...node,
                data: { ...node.data, ...updatedContent },
                position: updatedContent.position || node.position,
              }
            : node
        )
      );
    });

    // Handle edge_created events
    const unsubEdgeCreated = api.on('edge_created', (data: any) => {
      console.log('[App] edge_created:', data);

      const edgeData = data.data || data;
      const newEdge: Edge = {
        id: edgeData.id || `edge-${Date.now()}`,
        source: edgeData.source_id || edgeData.source,
        target: edgeData.target_id || edgeData.target,
        label: edgeData.label,
        type: 'smoothstep',
      };

      setEdges((prev) => {
        // Avoid duplicates (edge may already exist from onConnect)
        if (prev.some((e) => e.source === newEdge.source && e.target === newEdge.target)) {
          return prev;
        }
        return [...prev, newEdge];
      });
    });

    // Handle node_deleted events
    const unsubNodeDeleted = api.on('node_deleted', (data: any) => {
      const { id } = data.data || data;
      if (!id) return;
      setNodes((prev) => prev.filter((n) => n.id !== id));
      // Also remove edges connected to this node
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    });

    // Handle edge_deleted events
    const unsubEdgeDeleted = api.on('edge_deleted', (data: any) => {
      const { id } = data.data || data;
      if (!id) return;
      setEdges((prev) => prev.filter((e) => e.id !== id));
    });

    // Handle success with initial_state
    const unsubSuccess = api.on('success', (response: any) => {
      if (response.data?.type === 'initial_state') {
        console.log('[App] initial_state:', response.data);

        if (response.data.nodes && Array.isArray(response.data.nodes)) {
          const allDbNodes = response.data.nodes;
          const flowNodes = allDbNodes.map((dbNode: any) =>
            dbNodeToFlowNode(dbNode, allDbNodes)
          );

          // Keep demo nodes if backend returns empty state
          setNodes(flowNodes.length > 0 ? sortNodesParentFirst(flowNodes) : demoNodes);
        }
        if (response.data.edges && Array.isArray(response.data.edges)) {
          // Convert database edges to React Flow format
          const flowEdges = response.data.edges.map((dbEdge: any) => ({
            id: dbEdge.id,
            source: dbEdge.source_id,
            target: dbEdge.target_id,
            label: dbEdge.label,
            type: 'smoothstep',
          }));
          setEdges(flowEdges);
        }
      }
    });

    // Handle Claude responses
    const unsubClaudeResponse = api.on('claude_response', (response: any) => {
      console.log('[App] claude_response FULL STRUCTURE:', JSON.stringify(response, null, 2));

      // Defensive: Handle both possible formats
      // Format A: { data: { node: {...} } }
      // Format B: { questionNodeId, responseNode: {...} }

      let node = null;
      if (response.data?.node) {
        // Format A (from FRONTEND_API.md)
        node = response.data.node;
        console.log('[App] Using Format A: response.data.node');
      } else if (response.responseNode) {
        // Format B (from team-lead's message)
        node = response.responseNode;
        console.log('[App] Using Format B: response.responseNode');
      }

      if (node) {
        const respAgentName = response.data?.agentName || response.agentName;
        const newNode: Node = {
          id: node.id,
          type: 'agentNode',
          position: node.position || { x: Math.random() * 400 + 300, y: Math.random() * 300 + 200 },
          data: {
            question: JSON.parse(node.content).question,
            response: JSON.parse(node.content).response,
            agentName: respAgentName,
          },
        };

        setNodes((prev) => [...prev, newNode]);
        console.log('[App] Created AgentNode:', newNode.id);
      } else {
        console.warn('[App] Could not extract node from claude_response:', response);
      }
    });

    // Handle settings updates
    const unsubSettings = api.on('settings', (response: any) => {
      const settings = response.data || response;
      if (settings.agent_name) {
        setAgentName(settings.agent_name);
      }
      if (settings.anthropic_api_key) {
        setMaskedApiKey(settings.anthropic_api_key);
      }
    });

    // Cleanup on unmount
    return () => {
      unsubNodeCreated();
      unsubNodeUpdated();
      unsubNodeDeleted();
      unsubEdgeCreated();
      unsubEdgeDeleted();
      unsubSuccess();
      unsubClaudeResponse();
      unsubSettings();
      api.disconnect();
    };
  }, []);

  // Keep ref in sync
  useEffect(() => {
    agentNameRef.current = agentName;
  }, [agentName]);

  // Propagate agentName to all relevant nodes when it changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.type === 'agentNode' || node.type === 'richTextNode') {
          return { ...node, data: { ...node.data, agentName } };
        }
        return node;
      })
    );
  }, [agentName]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Collect additional remove changes for container children
    const extraRemoves: NodeChange[] = [];

    changes.forEach((change) => {
      if (change.type === 'position' && change.dragging === false && change.position) {
        apiRef.current.updateNode({
          id: change.id,
          position: change.position,
        });
      } else if (change.type === 'remove') {
        apiRef.current.deleteNode(change.id);
        // Cascade delete: if removing a container, also remove its children
        setNodes((nds) => {
          const children = nds.filter((n) => n.parentId === change.id);
          children.forEach((child) => {
            apiRef.current.deleteNode(child.id);
            extraRemoves.push({ type: 'remove', id: child.id });
          });
          return nds;
        });
      } else if (change.type === 'dimensions' && change.dimensions) {
        // Persist container resize to backend
        setNodes((nds) => {
          const node = nds.find((n) => n.id === change.id);
          if (node && node.type === 'containerNode') {
            apiRef.current.updateNode({
              id: change.id,
              data: {
                width: change.dimensions!.width,
                height: change.dimensions!.height,
              },
            });
          }
          return nds;
        });
      }
    });

    setNodes((nds) => applyNodeChanges([...changes, ...extraRemoves], nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    changes.forEach((change) => {
      if (change.type === 'remove') {
        apiRef.current.deleteEdge(change.id);
      }
    });

    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    // Send to backend — the edge_created broadcast will add it to state
    // with the server-generated UUID, keeping IDs in sync.
    apiRef.current.createEdge({
      source: connection.source!,
      target: connection.target!,
    });
  }, []);

  // Feature 3: Click-to-place handler
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (!activeTool) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    apiRef.current.createNode({
      type: activeTool.nodeType,
      position,
      data: { ...activeTool.defaultData, position },
    });
    setActiveTool(null); // one-shot: deselect after placing
  }, [activeTool, screenToFlowPosition]);

  // Feature 5: Selection change handler
  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    setSelectedNodes(selected);
  }, []);

  // Feature 4: Copy/paste keyboard handler + Escape to clear tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when user is typing in an input/textarea/contenteditable
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }

      // Escape: clear active tool
      if (e.key === 'Escape') {
        setActiveTool(null);
        return;
      }

      // Cmd/Ctrl+C: copy selected nodes
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (selectedNodes.length > 0) {
          copiedNodesRef.current = selectedNodes.map((n) => ({ ...n, data: { ...n.data } }));
          pasteCountRef.current = 0;
        }
        return;
      }

      // Cmd/Ctrl+V: paste copied nodes with stacked offset
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (copiedNodesRef.current.length === 0) return;
        e.preventDefault();
        pasteCountRef.current += 1;
        const offset = 25 * pasteCountRef.current;

        for (const node of copiedNodesRef.current) {
          const newPos = {
            x: node.position.x + offset,
            y: node.position.y + offset,
          };
          // Map flow type back to server type for createNode
          const serverType = Object.entries(nodeTypeMap).find(
            ([, flowType]) => flowType === node.type
          )?.[0] || 'richtext';

          apiRef.current.createNode({
            type: serverType,
            position: newPos,
            data: { ...node.data, position: newPos },
          });
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes]);

  return (
    <div style={{ width: '100vw', height: '100vh', cursor: activeTool ? 'crosshair' : undefined }}>
      {/* Connection indicator */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1000,
          padding: '8px 12px',
          background: isConnected ? '#10b981' : '#ef4444',
          color: 'white',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        {isConnected ? '● Connected' : '○ Disconnected'}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        minZoom={0.1}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        zoomOnScroll={false}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#475569', strokeWidth: 1.5 },
        }}
      >
        <Background />
        <Controls />
        <CanvasToolbar
          agentName={agentName}
          maskedApiKey={maskedApiKey}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          selectedNodes={selectedNodes}
          onSaveSettings={(settings) => {
            apiRef.current.updateSettings(settings);
            if (settings.agentName) setAgentName(settings.agentName);
          }}
        />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'agentNode':
                return '#6366f1';
              case 'richTextNode':
                return '#8b5cf6';
              case 'diagramNode':
                return '#22d3ee';
              case 'diagramBox':
                return '#22d3ee';
              case 'containerNode':
                return 'rgba(71, 85, 105, 0.3)';
              case 'terminalNode':
                return '#10b981';
              case 'stickyNoteNode':
                return '#fef08a';
              default:
                return '#4a5568';
            }
          }}
          style={{
            backgroundColor: '#1a202c',
          }}
        />
      </ReactFlow>
    </div>
  );
}

function App() {
  const boardId = new URLSearchParams(window.location.search).get('board') || undefined;

  return (
    <APIProvider boardId={boardId}>
      <ReactFlowProvider>
        <AppContent />
      </ReactFlowProvider>
    </APIProvider>
  );
}

export default App;
