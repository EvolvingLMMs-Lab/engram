// Core types for Engram

/**
 * A memory entry stored in the local database
 */
export interface Memory {
  /** Unique identifier (UUID v7 for time-ordered IDs) */
  id: string;
  /** The actual content/fact stored */
  content: string;
  /** 384-dimensional embedding vector */
  vector: Float32Array;
  /** Optional tags for categorization */
  tags: string[];
  /** Source of the memory (e.g., "claude-code-session-123") */
  source: string | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether the memory has been verified by the user */
  isVerified: boolean;
  /** Unix timestamp (ms) when created */
  createdAt: number;
  /** Unix timestamp (ms) when last updated */
  updatedAt: number;
}

/**
 * Input for creating a new memory
 */
export interface CreateMemoryInput {
  content: string;
  tags?: string[];
  source?: string;
  confidence?: number;
}

/**
 * Result of a memory search
 */
export interface SearchResult {
  memory: Memory;
  /** Distance/similarity score (lower is more similar for cosine distance) */
  distance: number;
}

/**
 * Configuration for Engram
 */
export interface EngramConfig {
  /** Path to the data directory (default: ~/.engram) */
  dataDir: string;
  /** Path to the SQLite database file */
  dbPath: string;
  /** Path to store embedding models */
  modelsDir: string;
  /** Embedding model name */
  embeddingModel: string;
  /** Vector dimensions (384 for MiniLM) */
  vectorDimensions: number;
}

/**
 * Sync event types for event sourcing
 */
export type SyncEventType = 'ADD' | 'UPDATE' | 'DELETE';

/**
 * A sync event for distributed state
 */
export interface SyncEvent {
  id: string;
  type: SyncEventType;
  memoryId: string;
  encryptedData: string | null;
  checksum: string | null;
  timestamp: number;
  sequenceNum: number;
}

/**
 * Device information for multi-device sync
 */
export interface Device {
  id: string;
  name: string;
  publicKey: string;
  lastSyncAt: number | null;
  createdAt: number;
}

/**
 * Encryption result with IV
 */
export interface EncryptedData {
  ciphertext: string;
  iv: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<EngramConfig> = {
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  vectorDimensions: 384,
};

/**
 * Memory scope for access control
 * - 'global': Accessible from any project (e.g., global plugins)
 * - 'project': Only accessible from the specific project
 */
export type MemoryScope = 'global' | 'project';

/**
 * Search options for memory queries
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Project path for filtering project-scoped memories */
  projectPath?: string;
}
