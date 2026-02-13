# GetSticky v3 - Frontend Application

React + Vite + React Flow application for the GetSticky v3 project.

## Setup Complete

### Structure
- `/src/nodes` - Node type components (ExampleNode created as demo)
- `/src/server` - Backend code (to be implemented)
- `/src/components` - Shared UI components
- `/src/lib` - Utilities and DB clients
- `/src/database` - Database layer (SQLite + LanceDB)
- `/src/mcp` - MCP server integration
- `/src/test` - Test setup and utilities

### Technologies
- **Canvas**: @xyflow/react - Infinite canvas with node graph
- **Rich Text**: @tiptap/react - Notion-style block editor
- **Diagrams**: Native React Flow nodes + edges (React Flow IS the diagramming tool)
- **Terminal**: @xterm/xterm - Terminal emulation
- **Markdown**: react-markdown - Render Claude responses
- **Code Highlight**: shiki, lowlight - Syntax highlighting
- **Database**: better-sqlite3 - Structured context storage
- **Vector DB**: @lancedb/lancedb - Semantic search
- **MCP**: @modelcontextprotocol/sdk - Claude Code bridge
- **Testing**: vitest, @testing-library/react

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Current Status

The scaffold is complete with:
- ✅ React + Vite + TypeScript configured
- ✅ React Flow canvas with infinite scroll, zoom, pan
- ✅ Example node demonstrating the node system
- ✅ Dark theme applied
- ✅ All stack dependencies installed
- ✅ Folder structure created
- ✅ Testing infrastructure set up

## Next Steps

Implement the 4 core node types:
1. **AgentNode** - Chat bubble showing Claude responses
2. **RichTextNode** - TipTap-based rich text editing
3. **DiagramNode** - Architecture diagrams via native React Flow nodes + edges
4. **TerminalNode** - xterm.js terminal emulation
