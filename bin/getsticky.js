#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');

// Parse CLI arguments
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return defaultValue;
  return args[index + 1] || defaultValue;
}

// Handle `getsticky mcp` subcommand — start the MCP server (stdio)
if (args[0] === 'mcp') {
  const mcpPath = path.resolve(__dirname, '..', 'server', 'dist-mcp', 'mcp', 'server.js');
  if (!fs.existsSync(mcpPath)) {
    console.error('Error: MCP server not found at', mcpPath);
    console.error('If running from source, run: npm run build:mcp');
    process.exit(1);
  }
  // Forward remaining args and env, then exec the MCP server
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [mcpPath, ...args.slice(1)], {
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (e) {
    process.exit(e.status || 1);
  }
  process.exit(0);
}

// Handle `getsticky init [name]` subcommand
if (args[0] === 'init') {
  const projectName = args[1] || path.basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const configPath = path.join(process.cwd(), '.getsticky.json');

  if (fs.existsSync(configPath)) {
    console.log('.getsticky.json already exists:', configPath);
    process.exit(0);
  }

  const config = { project: projectName };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Created .getsticky.json with project: "${projectName}"`);
  console.log('The MCP server will auto-detect this project on next run.');
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  getsticky - AI conversations on an infinite canvas

  Usage:
    getsticky [options]
    getsticky mcp             Start the MCP server (stdio transport)
    getsticky init [name]     Initialize .getsticky.json for project detection

  Options:
    --port <number>   Port to run on (default: 2528)
    --data <path>     Data directory path (default: ~/.getsticky/data)
    --help, -h        Show this help message

  MCP Server:
    claude mcp add --scope user getsticky npx getsticky mcp

    Or configure in .mcp.json:
    {
      "mcpServers": {
        "getsticky": {
          "command": "npx",
          "args": ["getsticky", "mcp"]
        }
      }
    }
`);
  process.exit(0);
}

const port = getArg('port', '2528');
const defaultDataDir = path.join(require('os').homedir(), '.getsticky', 'data');
const dataDir = getArg('data', defaultDataDir);

// Resolve static dir relative to this script
const staticDir = path.resolve(__dirname, '..', 'app');

if (!fs.existsSync(staticDir)) {
  console.error('Error: Built frontend not found at', staticDir);
  console.error('If running from source, run: npm run build');
  process.exit(1);
}

// Set environment variables for the server
process.env.WS_PORT = port;
process.env.DB_PATH = dataDir;
process.env.GETSTICKY_STATIC_DIR = staticDir;

// Start the server
require('../server/dist/index.js');
