import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import type { EngramConfig } from '../types.js';

/**
 * Get the default database path
 */
export function getDefaultDbPath(): string {
  const dataDir = join(homedir(), '.engram');
  return join(dataDir, 'memories.db');
}

/**
 * Get default data directory
 */
export function getDefaultDataDir(): string {
  return join(homedir(), '.engram');
}

/**
 * Initialize the SQLite database with sqlite-vec extension
 */
export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? getDefaultDbPath();
  const dir = dirname(path);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create database connection
  const db = new Database(path);

  // Load sqlite-vec extension
  sqliteVec.load(db);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Main memories table
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      vector BLOB NOT NULL,
      tags TEXT DEFAULT '[]',
      source TEXT,
      confidence REAL DEFAULT 0.5,
      is_verified INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Create index on created_at for efficient ordering
    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

    -- Create index on source for filtering
    CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);

    -- Vector index using sqlite-vec
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding float[384]
    );

    -- Sync events table for event sourcing
    CREATE TABLE IF NOT EXISTS sync_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      encrypted_data TEXT,
      checksum TEXT,
      timestamp INTEGER NOT NULL,
      sequence_num INTEGER NOT NULL
    );

    -- Create index on sequence_num for sync cursor
    CREATE INDEX IF NOT EXISTS idx_sync_events_seq ON sync_events(sequence_num);

     -- Local sync state
     CREATE TABLE IF NOT EXISTS sync_state (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     );

     -- Local vault key storage (decrypted vault key cached locally)
     CREATE TABLE IF NOT EXISTS local_vault_key (
       id TEXT PRIMARY KEY DEFAULT 'default',
       vault_key BLOB NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     );

     -- Secret sync state (separate cursor from memory sync)
     CREATE TABLE IF NOT EXISTS secret_sync_state (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     );

     -- Local secret sync events (mirrors remote for offline support)
     CREATE TABLE IF NOT EXISTS local_secret_sync_events (
       id TEXT PRIMARY KEY,
       event_type TEXT NOT NULL,
       secret_id TEXT NOT NULL,
       encrypted_data TEXT,
       iv TEXT,
       checksum TEXT,
       blind_id TEXT,
       timestamp INTEGER NOT NULL,
       sequence_num INTEGER NOT NULL
     );

     -- Index for efficient sync cursor queries
     CREATE INDEX IF NOT EXISTS idx_local_secret_sync_events_seq ON local_secret_sync_events(sequence_num);
   `);

  return db;
}

/**
 * Close the database connection properly
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
}

/**
 * Get configuration with defaults
 */
export function getConfig(overrides?: Partial<EngramConfig>): EngramConfig {
  const dataDir = overrides?.dataDir ?? getDefaultDataDir();
  return {
    dataDir,
    dbPath: overrides?.dbPath ?? join(dataDir, 'memories.db'),
    modelsDir: overrides?.modelsDir ?? join(dataDir, 'models'),
    embeddingModel: overrides?.embeddingModel ?? 'Xenova/all-MiniLM-L6-v2',
    vectorDimensions: overrides?.vectorDimensions ?? 384,
  };
}
