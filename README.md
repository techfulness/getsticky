<p align="center">
  <img src="https://raw.githubusercontent.com/techfulness/getsticky/main/sticky-logo-cropped.png" alt="GetSticky logo" width="200" />
</p>

<h1 align="center">GetSticky</h1>

<p align="center">
  <em>AI conversations on an infinite canvas — branch, diagram, and explore ideas with Claude</em>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://www.npmjs.com/package/getsticky"><img src="https://img.shields.io/npm/v/getsticky.svg" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node >=18" />
</p>

---

<!-- screenshot: Hero shot — full canvas with multiple node types visible (rich text, diagrams, sticky notes, conversation threads) -->

<!-- screenshot: Architecture diagram — diagram boxes with labeled edges and comment sidebars -->

<!-- screenshot: Rich text editing — TipTap editor with code blocks and formatting -->

<!-- screenshot: Sticky notes — colorful sticky notes arranged on the canvas -->

<!-- screenshot: Comment threads — inline commenting with Claude responses -->

## Quick Start

```bash
npx getsticky
```

Or install globally:

```bash
npm install -g getsticky && getsticky
# or
yarn global add getsticky && getsticky
```

Then open **http://localhost:2528** in your browser.

### Connect Claude Code

```bash
claude mcp add --scope user getsticky npx getsticky mcp
```

Using `--scope user` makes the MCP server available globally across all your projects. Every Claude Code session will connect to the same canvas and database.

Or add manually to a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "getsticky": {
      "command": "npx",
      "args": ["getsticky", "mcp"]
    }
  }
}
```

Claude Code can now create nodes, diagrams, sticky notes, and more — directly on your canvas.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port <number>` | `2528` | Port to run the server on |
| `--data <path>` | `~/.getsticky/data` | Data directory for SQLite and vector storage |

Initialize project detection in any repo:

```bash
getsticky init [name]
```

## Features

- **Rich Text Editor** — TipTap-powered block editor with syntax-highlighted code blocks, markdown shortcuts, and slash commands
- **Sticky Notes** — 11 colors with auto-fitting text, great for brainstorming and quick annotations
- **Architecture Diagrams** — Diagram boxes with labeled edges, comment sidebars, and auto-layout
- **Lists** — Organize items with status tracking (todo, in-progress, done)
- **Comment Threads** — Inline commenting on any node; discuss with Claude and resolve threads
- **MCP Integration** — 30+ tools for Claude Code to read, create, and manipulate everything on the canvas
- **Multi-project & Multi-board** — Organize work across projects with auto-detection via `.getsticky.json`
- **Auto-layout** — Dagre-powered hierarchical arrangement keeps diagrams clean
- **Real-time Sync** — WebSocket bridge pushes changes between Claude Code and the UI instantly
- **Code Reviews** — Put code on the canvas, comment inline with Claude, and resolve threads

## What is GetSticky?

GetSticky is an infinite canvas where Claude Code and humans collaborate visually. Instead of a linear chat window, it gives you a spatial workspace: branch conversations into parallel threads, diagram system architectures, annotate with comments, and organize ideas with sticky notes. Everything is persisted locally in SQLite and bridged to Claude via the Model Context Protocol (MCP).

## Why?

Linear chat loses context. After a hundred messages, the thread you need is buried. A canvas doesn't — every idea stays where you put it, connected to the things it relates to. Visual thinking combined with AI gives you better outcomes: you see the whole picture, Claude fills in the details, and nothing gets lost.

## Hackathon & Status

GetSticky was built as an entry for the **"Built with Opus 4.6" — a Claude Code virtual hackathon**.

This is an **alpha release**. It's stable enough to use day-to-day, but rough edges remain. Active development is continuing.

## Contributing

Contributions are welcome! Here's how to get started locally:

```bash
# Clone the repo
git clone https://github.com/gabrieli/getsticky.git
cd getsticky

# Install root dependencies
npm install

# Install and build the server
cd server && npm install && npm run build && cd ..

# Install and run the frontend dev server
cd getsticky-app && npm install && npm run dev
```

For testing information, see [getsticky-app/TESTING.md](getsticky-app/TESTING.md).

Found a bug or have an idea? [Open an issue](https://github.com/gabrieli/getsticky/issues).

## Acknowledgements

GetSticky is built on the shoulders of incredible open source projects:

- **[React Flow](https://reactflow.dev/)** (`@xyflow/react`) — the infinite canvas that makes everything possible
- **[TipTap](https://tiptap.dev/)** — rich text editing, beautifully extensible
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — fast, reliable local database
- **[LanceDB](https://lancedb.com/)** — embedded vector search for semantic context
- **[MCP SDK](https://modelcontextprotocol.io/)** (`@modelcontextprotocol/sdk`) — the bridge between Claude Code and the canvas
- **[Dagre](https://github.com/dagrejs/dagre)** (`@dagrejs/dagre`) — graph layout algorithms for auto-arrangement
- **[lowlight](https://github.com/wooorm/lowlight)** — syntax highlighting for code blocks
- **[xterm.js](https://xtermjs.org/)** — terminal emulation in the browser
- **[react-markdown](https://github.com/remarkjs/react-markdown)** — markdown rendering
- **[Vite](https://vitejs.dev/)** — lightning-fast build tooling
- **[Vitest](https://vitest.dev/) & [Playwright](https://playwright.dev/)** — testing frameworks

And of course, **React**, **TypeScript**, and the broader open source community. None of this would be possible without the creativity and generosity of the people who build and share their work freely.

## License

[MIT](./LICENSE)
