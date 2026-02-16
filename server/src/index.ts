/**
 * GetSticky Server
 * Main entry point for the backend server
 * Runs WebSocket server for frontend communication
 */

import { homedir } from 'os';
import path from 'path';
import { initDB } from './db/index';
import { GetStickyWSServer } from './websocket/server';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const WS_PORT = parseInt(process.env.WS_PORT || '8080', 10);
const DB_PATH = process.env.DB_PATH || path.join(homedir(), '.getsticky', 'data');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const STATIC_DIR = process.env.GETSTICKY_STATIC_DIR || undefined;

async function main() {
  console.log('Starting GetSticky Server...');

  // Initialize database
  console.log('Initializing database...');
  const db = await initDB(DB_PATH);
  console.log('Database initialized');

  // Start WebSocket server
  console.log(`Starting WebSocket server on port ${WS_PORT}...`);
  const wsServer = new GetStickyWSServer(WS_PORT, db, ANTHROPIC_API_KEY, STATIC_DIR);

  // Check for API key: DB takes priority, then env
  const dbApiKey = db.getSetting('anthropic_api_key');
  if (dbApiKey) {
    console.log('Claude API integration enabled (key from database)');
  } else if (ANTHROPIC_API_KEY) {
    console.log('Claude API integration enabled (key from environment)');
  } else {
    console.log('No API key configured - set one via Settings in the app');
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    wsServer.close();
    await db.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    wsServer.close();
    await db.close();
    process.exit(0);
  });

  console.log('GetSticky Server ready!');
  console.log(`WebSocket server: ws://localhost:${WS_PORT}`);
  console.log(`Database path: ${DB_PATH}`);
  if (STATIC_DIR) {
    console.log(`Frontend: http://localhost:${WS_PORT}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
