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
import ListNode from './nodes/ListNode';
import { computeListLayout, LIST_WIDTH } from './nodes/ListNode';
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
  listNode: withErrorBoundary(ListNode as any),
};

const nodeTypeMap: Record<string, string> = {
  conversation: 'agentNode',
  richtext: 'richTextNode',
  diagram: 'diagramNode',
  diagramBox: 'diagramBox',
  container: 'containerNode',
  terminal: 'terminalNode',
  stickyNote: 'stickyNoteNode',
  list: 'listNode',
};

// React Flow requires parent nodes to appear before children in the array
function sortNodesParentFirst(nodes: Node[]): Node[] {
  const parentIds = new Set(
    nodes.filter((n) => n.type === 'containerNode' || n.type === 'listNode').map((n) => n.id)
  );
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

/** Compute ideal width for a richtext node so the longest line fits without wrapping */
function computeRichTextWidth(content: any): number {
  let text = '';
  if (content.plainText) text = content.plainText;
  else if (typeof content.content === 'string') text = content.content.replace(/<[^>]*>/g, '');
  else if (typeof content.text === 'string') text = content.text.replace(/<[^>]*>/g, '');

  if (!text) return 800;

  const lines = text.split('\n');
  const longestLine = Math.max(...lines.map((l: string) => l.length));

  // At 14px sans-serif, avg char width ~7.7px, plus 40px padding (20px each side)
  const idealWidth = longestLine * 7.7 + 40;
  return Math.max(600, Math.min(1800, Math.round(idealWidth)));
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

  // RichText nodes need explicit width (height is auto via CSS)
  if (flowType === 'richTextNode') {
    node.style = {
      width: content.width || computeRichTextWidth(content),
    };
  }

  // StickyNote nodes need explicit width (height is auto via CSS)
  if (flowType === 'stickyNoteNode') {
    node.style = {
      width: content.width || 200,
    };
  }

  // List nodes: fixed width, auto height
  if (flowType === 'listNode') {
    node.style = {
      width: LIST_WIDTH,
    };
  }

  // If this node has a parent that is a container or list, set up grouping
  if (dbNode.parent_id && allDbNodes) {
    const parent = allDbNodes.find((n: any) => n.id === dbNode.parent_id);
    if (parent && (parent.type === 'container' || parent.type === 'list')) {
      node.parentId = dbNode.parent_id;
      // Only constrain children inside containers, not lists.
      // List children must be freely draggable so they can be pulled out.
      if (parent.type === 'container') {
        node.extent = 'parent';
        node.expandParent = true;
      }
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
    style: { width: 800 },
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
  const { screenToFlowPosition, setViewport, fitView, getNodes, getViewport } = useReactFlow();

  // Guard: node IDs whose parentId was just changed locally (skip WS echo overwrite)
  const recentParentChanges = useRef<Set<string>>(new Set());

  // Viewport persistence: debounced save
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipViewportSaveRef = useRef(false);

  // Stable refs for useReactFlow functions used inside mount effect
  const setViewportRef = useRef(setViewport);
  const fitViewRef = useRef(fitView);
  setViewportRef.current = setViewport;
  fitViewRef.current = fitView;

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
          type: n.type === 'containerNode' ? 'container' : n.type === 'listNode' ? 'list' : n.type,
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

      setNodes((prev) => {
        const updated = prev.map((node) => {
          if (node.id !== dbNode.id) return node;

          // If we recently changed parentId locally, skip position + parent overwrite from echo
          const isGuarded = recentParentChanges.current.has(dbNode.id);

          const patched: Node = {
            ...node,
            data: { ...node.data, ...updatedContent },
            position: isGuarded ? node.position : (updatedContent.position || node.position),
          };

          // Detect parent_id changes (drag into/out of list)
          // Skip if we just changed parentId locally (avoid race with WS echo)
          if (!isGuarded) {
            const echoParent = dbNode.parent_id || null;
            const localParent = node.parentId || null;
            if (echoParent !== localParent) {
              if (echoParent) {
                const parent = prev.find((n) => n.id === echoParent);
                if (parent && (parent.type === 'listNode' || parent.type === 'containerNode')) {
                  patched.parentId = echoParent;
                  // Only constrain inside containers, not lists
                  if (parent.type === 'containerNode') {
                    patched.extent = 'parent';
                    patched.expandParent = true;
                  }
                }
              } else {
                // Cleared parent - node is now free-floating
                delete patched.parentId;
                delete patched.extent;
                delete patched.expandParent;
              }
            }
          }

          return patched;
        });
        return sortNodesParentFirst(updated);
      });
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

        // Restore saved viewport or fitView for new boards
        const savedViewport = response.data.viewport;
        requestAnimationFrame(() => {
          if (savedViewport) {
            skipViewportSaveRef.current = true;
            setViewportRef.current({ x: savedViewport.x, y: savedViewport.y, zoom: savedViewport.zoom });
          } else {
            fitViewRef.current({ padding: 0.2 });
          }
        });
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
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
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
        // Persist resize to backend for resizable node types
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
          } else if (node && (node.type === 'richTextNode' || node.type === 'stickyNoteNode')) {
            // Only persist width — height is auto via CSS
            apiRef.current.updateNode({
              id: change.id,
              data: {
                width: change.dimensions!.width,
              },
            });
          }
          return nds;
        });
      }
    });

    setNodes((nds) => {
      const updated = applyNodeChanges([...changes, ...extraRemoves], nds);
      // Strip height from richTextNodes so React Flow measures actual DOM height
      // (needed for MiniMap accuracy — CSS fit-content overrides height visually
      // but React Flow's internal state would be stale otherwise)
      return updated.map((node) => {
        if ((node.type === 'richTextNode' || node.type === 'stickyNoteNode') && node.style?.height != null) {
          const { height, ...rest } = node.style;
          return { ...node, style: rest };
        }
        return node;
      });
    });
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

  // Helper: re-parent a node by removing and re-adding it (React Flow doesn't support dynamic parentId changes)
  const reparentNode = useCallback((nodeId: string, updates: Partial<Node>) => {
    recentParentChanges.current.add(nodeId);
    setTimeout(() => recentParentChanges.current.delete(nodeId), 2000);
    setNodes((prev) => {
      const existing = prev.find((n) => n.id === nodeId);
      if (!existing) return prev;
      const rebuilt: Node = { ...existing, ...updates };
      // Remove old, add rebuilt
      const without = prev.filter((n) => n.id !== nodeId);
      return sortNodesParentFirst([...without, rebuilt]);
    });
  }, []);

  // Detach margin in flow-coordinates (zoom-independent).
  // Multiplied by current zoom to get screen pixels at runtime.
  const DETACH_MARGIN_FLOW = 40;

  // Try to detach a child node from its parent list when dragged outside bounds.
  // Returns true if detached, false if still inside.
  const handleDetachFromList = useCallback((draggedNode: Node, parentNode: Node, zoom: number, allNodes: Node[]): boolean => {
    const parentEl = document.querySelector(`[data-id="${parentNode.id}"]`);
    const draggedEl = document.querySelector(`[data-id="${draggedNode.id}"]`);
    if (!parentEl || !draggedEl) return false;

    const parentRect = parentEl.getBoundingClientRect();
    const draggedRect = draggedEl.getBoundingClientRect();
    const centerX = draggedRect.left + draggedRect.width / 2;
    const centerY = draggedRect.top + draggedRect.height / 2;
    const margin = DETACH_MARGIN_FLOW * zoom;

    if (centerX < parentRect.left - margin || centerX > parentRect.right + margin ||
        centerY < parentRect.top - margin || centerY > parentRect.bottom + margin) {
      const absX = parentNode.position.x + draggedNode.position.x;
      const absY = parentNode.position.y + draggedNode.position.y;
      apiRef.current.updateNode({
        id: draggedNode.id,
        parentId: null,
        data: { order: undefined, inList: undefined },
        position: { x: absX, y: absY },
      });
      reparentNode(draggedNode.id, {
        parentId: undefined,
        extent: undefined,
        expandParent: undefined,
        position: { x: absX, y: absY },
      });

      // Reflow remaining siblings to fill the gap
      const siblings = allNodes
        .filter((n) => n.parentId === parentNode.id && n.id !== draggedNode.id)
        .sort((a, b) => ((a.data as any).order ?? 999) - ((b.data as any).order ?? 999));
      const layout = computeListLayout(siblings.length);
      siblings.forEach((sibling, index) => {
        const newPos = layout.positions[index];
        apiRef.current.updateNode({ id: sibling.id, data: { order: index }, position: newPos });
      });
      setNodes((prev) =>
        prev.map((node) => {
          const idx = siblings.findIndex((s) => s.id === node.id);
          if (idx === -1) return node;
          return { ...node, position: layout.positions[idx], data: { ...node.data, order: idx } };
        })
      );

      return true;
    }
    return false;
  }, [reparentNode]);

  // Find the closest list node whose DOM rect contains a screen point.
  // Uses closest-center to avoid incorrect targeting with overlapping wrappers.
  const findTargetList = useCallback((centerX: number, centerY: number, allNodes: Node[], excludeId: string): Node | undefined => {
    const listNodes = allNodes.filter((n) => n.type === 'listNode' && n.id !== excludeId);
    let targetList: Node | undefined;
    let minDist = Infinity;
    for (const listNode of listNodes) {
      const listEl = document.querySelector(`[data-id="${listNode.id}"]`);
      if (!listEl) continue;
      const listRect = listEl.getBoundingClientRect();
      if (centerX >= listRect.left && centerX <= listRect.right &&
          centerY >= listRect.top && centerY <= listRect.bottom) {
        const dx = centerX - (listRect.left + listRect.width / 2);
        const dy = centerY - (listRect.top + listRect.height / 2);
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          targetList = listNode;
        }
      }
    }
    return targetList;
  }, []);

  // Attach a dragged node to a target list at the next slot.
  const handleAttachToList = useCallback((draggedNode: Node, targetList: Node, allNodes: Node[]) => {
    const listChildren = allNodes.filter((n) => n.parentId === targetList.id);
    const nextOrder = listChildren.length;
    const layout = computeListLayout(nextOrder + 1);
    const newPos = layout.positions[nextOrder] || layout.nextSlot;

    const extraData: any = { order: nextOrder };
    if (draggedNode.type === 'richTextNode') {
      extraData.inList = true;
    }

    apiRef.current.updateNode({
      id: draggedNode.id,
      parentId: targetList.id,
      data: extraData,
      position: newPos,
    });

    // No extent/expandParent — list children must be freely draggable
    reparentNode(draggedNode.id, {
      parentId: targetList.id,
      extent: undefined,
      expandParent: undefined,
      position: newPos,
      data: { ...draggedNode.data, ...extraData },
    });
  }, [reparentNode]);

  // Reorder a child within its parent list based on where it was dropped.
  const handleReorderInList = useCallback((draggedNode: Node, parentNode: Node, allNodes: Node[]) => {
    const siblings = allNodes
      .filter((n) => n.parentId === parentNode.id)
      .sort((a, b) => ((a.data as any).order ?? 999) - ((b.data as any).order ?? 999));
    if (siblings.length <= 1) return;

    const currentOrder = (draggedNode.data as any).order ?? 0;
    const dragY = draggedNode.position.y;

    // Find the slot whose layout Y is closest to the dragged position
    const layout = computeListLayout(siblings.length);
    let targetOrder = 0;
    let minDist = Infinity;
    for (let i = 0; i < layout.positions.length; i++) {
      const dist = Math.abs(dragY - layout.positions[i].y);
      if (dist < minDist) { minDist = dist; targetOrder = i; }
    }

    if (targetOrder === currentOrder) {
      // Snap back to its own slot position
      const correctPos = layout.positions[currentOrder];
      setNodes((prev) => prev.map((n) => (n.id === draggedNode.id ? { ...n, position: correctPos } : n)));
      return;
    }

    // Reorder: remove from current position, insert at target
    const ordered = siblings.filter((s) => s.id !== draggedNode.id);
    ordered.splice(targetOrder, 0, draggedNode);
    ordered.forEach((sibling, index) => {
      apiRef.current.updateNode({ id: sibling.id, data: { order: index }, position: layout.positions[index] });
    });
    setNodes((prev) =>
      prev.map((node) => {
        const idx = ordered.findIndex((s) => s.id === node.id);
        if (idx === -1) return node;
        return { ...node, position: layout.positions[idx], data: { ...node.data, order: idx } };
      })
    );
  }, []);

  // Drag-to-list: on drop, check if dragged node overlaps a list
  const onNodeDragStop = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    if (draggedNode.type === 'listNode' || draggedNode.type === 'containerNode') return;

    const allNodes = getNodes();
    const { zoom } = getViewport();

    // Get the dragged element's screen position (for list overlap checks)
    const draggedEl = document.querySelector(`[data-id="${draggedNode.id}"]`);
    if (!draggedEl) return;
    const draggedRect = draggedEl.getBoundingClientRect();
    const centerX = draggedRect.left + draggedRect.width / 2;
    const centerY = draggedRect.top + draggedRect.height / 2;

    const previousParentId = draggedNode.parentId;

    // Already inside a list — check if dragged outside or reorder within
    if (previousParentId) {
      const parentNode = allNodes.find((n) => n.id === previousParentId);
      if (parentNode && parentNode.type === 'listNode') {
        const detached = handleDetachFromList(draggedNode, parentNode, zoom, allNodes);
        if (!detached) {
          // Still inside the list — reorder within it
          handleReorderInList(draggedNode, parentNode, allNodes);
          return;
        }
        // Detached — fall through to check if landed on another list
      }
    }

    // Check if dropped onto a list
    const targetList = findTargetList(centerX, centerY, allNodes, draggedNode.id);
    if (!targetList || targetList.id === previousParentId) return;

    handleAttachToList(draggedNode, targetList, allNodes);
  }, [getNodes, getViewport, handleDetachFromList, findTargetList, handleAttachToList, handleReorderInList]);

  // Feature 5: Selection change handler
  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    setSelectedNodes(selected);
  }, []);

  // Debounced viewport persistence
  const onViewportChange = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    if (skipViewportSaveRef.current) {
      skipViewportSaveRef.current = false;
      return;
    }
    if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
    viewportTimerRef.current = setTimeout(() => {
      apiRef.current.updateViewport(viewport.x, viewport.y, viewport.zoom);
    }, 5000);
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
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onViewportChange={onViewportChange}
        nodeTypes={nodeTypes}
        selectNodesOnDrag={false}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        minZoom={0.1}
        maxZoom={4}
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
              case 'listNode':
                return '#6366f1';
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
