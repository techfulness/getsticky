# GetSticky v3: The Modular Node Architecture

## The Core Insight

You nailed it — React Flow is the canvas, everything else is a node. Each node is just a React component. The power isn't in any single library, it's in the composition.

```
GetSticky = React Flow (canvas) 
           + Node Types (pluggable React components)
           + Context Layer (local DB)
           + MCP Server (Claude Code bridge)
```

No forks. No license risk. Everything composable. Everything MIT.

---

## Node Types: The Building Blocks

### 1. 📝 Rich Text Node — "The Notion Block"

**The question:** What gives us beautiful typography, block-based editing, Notion-style UX, in a React component we can drop into a React Flow node?

**Winner: TipTap**
- **License:** MIT ✅
- **Stars:** 30K+ | Weekly downloads: 800K+
- **Why TipTap over BlockNote:** TipTap is headless — you control 100% of the styling. BlockNote is MPL-2.0 (weaker copyleft, fine but less clean). TipTap gives you maximum design control, which matters when you want a distinctive look.
- **Built on:** ProseMirror (the gold standard for rich text editing)
- **Key features:** Block-based editing, slash commands, markdown shortcuts, code blocks with syntax highlighting, collaborative editing via Yjs
- **Extension system:** 100+ extensions. Want math? Add it. Want task lists? Add it. Mentions? Add it.

**How it works as a node:**
```tsx
const RichTextNode = ({ data, id }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start typing...' }),
      CodeBlockLowlight,  // syntax-highlighted code blocks
      Markdown,           // paste markdown, renders beautifully
    ],
    content: data.content,
    onUpdate: ({ editor }) => {
      updateNodeData(id, { content: editor.getJSON() });
      // Also update context DB with the text content
      syncToContextDB(id, editor.getText());
    },
  });

  return (
    <div className="rich-text-node">
      <Handle type="target" position={Position.Left} />
      <EditorContent editor={editor} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
};
```

**The Claude connection:** When Claude Code responds, it writes markdown. TipTap renders that markdown beautifully — code blocks, headers, lists, all styled. The user can then edit in-place, branch the conversation, or annotate. This is the "Claude + Notion" vision.

**Alternative: BlockNote** — If you want the fastest possible "looks like Notion" setup, BlockNote gives you slash menus, drag handles, and block toolbars out of the box with zero styling work. License is MPL-2.0 (the core blocks and UI are actually permissive, only some Pro features are GPL). For hackathon speed, BlockNote might actually be faster to ship. You can always swap later.

---

### 2. 📊 Diagram Node — "The Whiteboard"

**The insight:** React Flow IS a diagramming tool. For architecture diagrams, the React Flow canvas already shows nodes and edges. Claude Code creates service nodes, connects them with edges — that IS the diagram. No separate diagram library needed.

**How it works as a node:**
```tsx
const DiagramNode = ({ data, id }) => {
  return (
    <div className="diagram-node">
      <Handle type="target" position={Position.Left} />

      {/* Title and description */}
      <div className="diagram-header">{data.title}</div>
      <div className="diagram-description">{data.description}</div>

      {/* Context for Q&A */}
      {data.context && <div className="diagram-context">{data.context}</div>}

      {/* Ask about this diagram */}
      <button onClick={() => askAboutDiagram(id)}>Ask about this diagram</button>

      <Handle type="source" position={Position.Right} />
    </div>
  );
};
```

**The power play:** Claude Code creates diagram nodes for each service/component in your architecture and connects them with labeled edges. You click a node and ask "what does this do?" — the agent reads the stored context (not re-parsing the codebase) and responds in a new branched conversation node. Since these are native React Flow nodes, they're fully draggable, editable, and interactive.

**Future option: Excalidraw** — For free-form drawing (sketch UIs, annotate, brainstorm). Heavier dependency with known embedding bugs in React Flow. Could be a v2 addition.

---

### 3. 💻 Terminal Node — "The Claude Code Window"

- **xterm.js** — MIT ✅, 18K stars
- Embeds a real terminal in a React Flow node
- Connected to Claude Code session via WebSocket
- User sees Claude's terminal output in real-time on the canvas
- Stretch goal for hackathon (P1)

---

### 4. 🤖 Agent Response Node — "The Chat Bubble"

This might be the simplest but most important node. A styled card that shows:
- The user's question
- Claude's response (rendered as rich markdown via TipTap or react-markdown)
- Action buttons: Branch, Edit, Regenerate
- Stored context metadata

This is the atomic unit of the multi-node conversation system.

---

## Context Layer: The Memory

### The Problem
"Each diagram should hold a context — so that if the user asks questions, the context should be there rather than gathered from the code every time."

### The Solution: Two-tier local storage

#### Tier 1: SQLite (better-sqlite3) — Structured context
- **License:** MIT (better-sqlite3), Public Domain (SQLite itself)
- Every node gets a row. Stores: node content, conversation history, relationships, metadata
- Fast, local, zero-config, runs anywhere
- The MCP server reads/writes this directly

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT,            -- 'conversation', 'diagram', 'terminal', 'richtext'
  content TEXT,         -- JSON blob of node-specific data
  context TEXT,         -- accumulated context for this node
  parent_id TEXT,       -- for conversation branching
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  target_id TEXT,
  label TEXT
);

-- Context inheritance: when branching, child gets parent's context
CREATE TABLE context_chain (
  node_id TEXT,
  context_entry TEXT,   -- individual context chunk
  source TEXT,          -- 'user', 'agent', 'codebase', 'diagram'
  embedding BLOB,       -- vector embedding for semantic search (Tier 2)
  created_at DATETIME
);
```

#### Tier 2: LanceDB — Semantic context search
- **License:** Apache-2.0 ✅
- **What it is:** Embedded vector database — "SQLite for vectors"
- **Why LanceDB:** Runs locally, no server, has a TypeScript SDK, built on Apache Arrow for speed
- **The killer feature for GetSticky:** When the user asks a question, we don't just search the current node's context — we can semantically search across ALL nodes on the canvas

**How it works:**
1. User creates a diagram of their microservices architecture
2. Context is stored: "Auth service handles JWT tokens, connects to Redis for session cache, PostgreSQL for user data"
3. Later, the user creates a conversation node and asks: "which service handles sessions?"
4. LanceDB semantic search finds the auth service context → agent responds with the right info, no re-parsing

```typescript
import * as lancedb from '@lancedb/lancedb';

// Create/open local DB (just a folder on disk)
const db = await lancedb.connect('./getsticky-data');

// Store context with embeddings
const table = await db.createTable('contexts', [
  { 
    nodeId: 'node-1',
    text: 'Auth service handles JWT tokens and session management',
    vector: await embed('Auth service handles JWT tokens...'), // Claude/OpenAI embeddings
    source: 'diagram',
    createdAt: new Date()
  }
]);

// Semantic search across all contexts
const results = await table
  .search(await embed('which service handles sessions?'))
  .limit(5)
  .toArray();
// → Returns auth service context even though "sessions" ≠ "JWT tokens"
```

**For the hackathon:** Start with SQLite only (Tier 1). Context per node, simple key-value lookup. Add LanceDB (Tier 2) as the "wow factor" if time permits — "semantic search across your entire canvas" is a very demo-able feature.

---

## Full Stack: All MIT/Apache-2.0

| Layer | Package | License | Purpose |
|-------|---------|---------|---------|
| **Canvas** | `@xyflow/react` | MIT | Infinite canvas, node graph, edges |
| **Rich Text** | `@tiptap/react` + extensions | MIT | Notion-style block editor in nodes |
| **Diagrams** | Native React Flow nodes + edges | MIT | Architecture diagrams via the canvas itself |
| **Terminal** | `xterm.js` + `xterm-addon-fit` | MIT | Terminal emulation in nodes |
| **Markdown** | `react-markdown` | MIT | Render Claude responses |
| **Code highlight** | `shiki` or `highlight.js` | MIT/BSD | Syntax highlighting |
| **Structured DB** | `better-sqlite3` | MIT | Node data, context, relationships |
| **Vector DB** | `@lancedb/lancedb` | Apache-2.0 | Semantic search across contexts |
| **MCP** | `@modelcontextprotocol/sdk` | MIT | Claude Code bridge |
| **Framework** | React + Vite | MIT | Frontend |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        React Flow Canvas                        │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌───────────────┐  │
│  │ RichTextNode │────▶│ AgentNode    │────▶│ DiagramNode   │  │
│  │ (TipTap)     │     │ (response)   │     │ (React Flow)  │  │
│  │              │     │              │     │               │  │
│  │ User writes  │     │ Claude       │     │ Native nodes  │  │
│  │ a question   │     │ responds     │     │ + edges       │  │
│  └──────────────┘     └──────┬───────┘     └───────┬───────┘  │
│                              │ branch              │           │
│                     ┌────────▼───────┐    ┌────────▼────────┐ │
│                     │ AgentNode      │    │ AgentNode       │ │
│                     │ (follow-up)    │    │ (diagram Q&A)   │ │
│                     └────────────────┘    └─────────────────┘ │
└───────────────────────────────┬────────────────────────────────┘
                                │ WebSocket
                    ┌───────────▼───────────┐
                    │   GetSticky Server     │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │ MCP Server       │  │
                    │  │ (Claude Code)    │  │
                    │  └──────────────────┘  │
                    │  ┌──────────────────┐  │
                    │  │ SQLite           │  │
                    │  │ (node data)      │  │
                    │  └──────────────────┘  │
                    │  ┌──────────────────┐  │
                    │  │ LanceDB          │  │
                    │  │ (vector search)  │  │
                    │  └──────────────────┘  │
                    └───────────┬────────────┘
                                │ stdio
                    ┌───────────▼───────────┐
                    │    Claude Code         │
                    │    (terminal)          │
                    └───────────────────────┘
```

---

## Revised Sprint Plan

### Days 1-2: Canvas + First Node
- React + Vite + React Flow scaffold
- `AgentNode` type: shows question + Claude response, styled beautifully
- Edge connections between nodes (arrows)
- SQLite setup via better-sqlite3 on the server
- Basic MCP server that can create nodes

### Days 3-4: Multi-Node Conversations (THE DEMO)
- Branching: click "Branch" on any agent node → creates child node
- Context inheritance: child node carries parent's context
- `RichTextNode` with TipTap: user writes questions with beautiful formatting
- Agent responses render with syntax-highlighted code, markdown, etc.
- This is the money shot for the demo

### Days 5-6: Diagrams + Context
- `DiagramNode` using native React Flow nodes + edges for architecture diagrams
- Per-node context storage in SQLite
- "Ask about this diagram" — click diagram node, ask question, get contextualized answer
- If time: LanceDB integration for semantic search across canvas

### Day 7: Polish
- Beautiful default theme (dark mode, clean typography)
- Demo video showing the non-linear conversation flow
- README for community
- Terminal node if time permits

---

## Why This Wins

**For the hackathon:** Non-linear AI conversations on an infinite canvas is immediately visually striking and demo-able. Judges see the branching, the diagrams, the context — it's unlike any other AI chat interface.

**For going viral:** Every developer who's ever lost context in a 200-message Claude chat will immediately get it. "Wait, I can branch my conversation and keep working on two threads at once?" That's the tweet that writes itself.

**For the community:** The node type system is the extensibility story. Build a node, share a node. Jupyter node, Figma node, GitHub PR node, database query node. GetSticky becomes a platform, not just a tool.

**For the license:** 100% MIT/Apache-2.0. No watermarks. No license keys. Fork it, ship it, sell it, whatever. That's how you build trust with the open source community.