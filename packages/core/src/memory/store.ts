import type Database from 'better-sqlite3';
import { v7 as uuidv7 } from 'uuid';

import { CryptoService } from '../crypto/service.js';
import { DLPSanitizer } from '../security/dlp.js';
import type {
  CreateMemoryInput,
  EncryptedData,
  Memory,
  SearchOptions,
  SearchResult,
  SyncEvent,
  SyncEventType,
} from '../types.js';

export class MemoryStore {
  private db: Database.Database;
  private sanitizer: DLPSanitizer;
  private crypto: CryptoService | null;

  constructor(db: Database.Database, cryptoService?: CryptoService) {
    this.db = db;
    this.sanitizer = new DLPSanitizer();
    this.crypto = cryptoService ?? null;
  }

  setCryptoService(cryptoService: CryptoService): void {
    this.crypto = cryptoService;
  }

  isEncryptionEnabled(): boolean {
    return this.crypto !== null;
  }

  private encryptContent(
    content: string
  ): { encrypted: EncryptedData; checksum: string } | null {
    if (!this.crypto) return null;
    const encrypted = this.crypto.encrypt(content);
    const checksum = CryptoService.sha256(content);
    return { encrypted, checksum };
  }

  private decryptContent(encrypted: EncryptedData): string {
    if (!this.crypto) throw new Error('Crypto service not configured');
    return this.crypto.decrypt(encrypted);
  }

  applyEncryptedSyncEvent(event: SyncEvent, vector?: Float32Array): void {
    if (!event.encryptedData) {
      throw new Error('Sync event has no encrypted data');
    }

    const encrypted = JSON.parse(event.encryptedData) as EncryptedData;
    const content = this.decryptContent(encrypted);

    if (event.checksum) {
      const actualChecksum = CryptoService.sha256(content);
      if (actualChecksum !== event.checksum) {
        throw new Error('Checksum mismatch - data may be corrupted');
      }
    }

    if (event.type === 'ADD' && vector) {
      const existing = this.get(event.memoryId);
      if (!existing) {
        this.createFromSync(event.memoryId, content, vector, event.timestamp);
      }
    } else if (event.type === 'UPDATE') {
      this.update(event.memoryId, { content });
    } else if (event.type === 'DELETE') {
      this.delete(event.memoryId);
    }
  }

  private createFromSync(
    id: string,
    content: string,
    vector: Float32Array,
    timestamp: number
  ): void {
    const { sanitized, detected } = this.sanitizer.sanitize(content);
    const tags = detected.length > 0 ? ['dlp-redacted'] : [];

    this.db
      .prepare(
        `
      INSERT INTO memories (id, content, vector, tags, source, confidence, is_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        sanitized,
        Buffer.from(vector.buffer),
        JSON.stringify(tags),
        'sync',
        0.5,
        0,
        timestamp,
        timestamp
      );

    this.db
      .prepare(
        `
      INSERT INTO memories_vec (memory_id, embedding)
      VALUES (?, ?)
    `
      )
      .run(id, vector);
  }

  /**
   * Expose sanitization logic for external use (e.g. before embedding)
   */
  public sanitize(content: string): { sanitized: string; detected: string[] } {
    return this.sanitizer.sanitize(content);
  }

  /**
   * Create a new memory
   */
  create(input: CreateMemoryInput, vector: Float32Array): Memory {
    const { sanitized, detected } = this.sanitizer.sanitize(input.content);
    const finalContent = sanitized;
    const finalTags = [...(input.tags ?? [])];

    if (detected.length > 0 && !finalTags.includes('dlp-redacted')) {
      finalTags.push('dlp-redacted');
    }

    const id = uuidv7();
    const now = Date.now();

    const memory: Memory = {
      id,
      content: finalContent,
      vector,
      tags: finalTags,
      source: input.source ?? null,
      confidence: input.confidence ?? 0.5,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    };

    // Insert into memories table
    const insertMemory = this.db.prepare(`
      INSERT INTO memories (id, content, vector, tags, source, confidence, is_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert into vector index
    const insertVec = this.db.prepare(`
      INSERT INTO memories_vec (memory_id, embedding)
      VALUES (?, ?)
    `);

    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      insertMemory.run(
        memory.id,
        memory.content,
        Buffer.from(memory.vector.buffer),
        JSON.stringify(memory.tags),
        memory.source,
        memory.confidence,
        memory.isVerified ? 1 : 0,
        memory.createdAt,
        memory.updatedAt
      );

      insertVec.run(memory.id, memory.vector);
    });

    transaction();

    const encryptResult = this.encryptContent(memory.content);
    this.recordSyncEvent(
      'ADD',
      memory.id,
      encryptResult ? JSON.stringify(encryptResult.encrypted) : undefined,
      encryptResult?.checksum
    );

    return memory;
  }

  /**
   * Get a memory by ID
   */
  get(id: string): Memory | null {
    const row = this.db
      .prepare(
        `
      SELECT id, content, vector, tags, source, confidence, is_verified, created_at, updated_at
      FROM memories
      WHERE id = ?
    `
      )
      .get(id) as MemoryRow | undefined;

    if (!row) return null;

    return this.rowToMemory(row);
  }

  getById(id: string): Memory | null {
    return this.get(id);
  }

  /**
   * Update a memory
   */
  update(
    id: string,
    updates: Partial<
      Pick<Memory, 'content' | 'tags' | 'confidence' | 'isVerified'>
    >,
    newVector?: Float32Array
  ): Memory | null {
    const existing = this.get(id);
    if (!existing) return null;

    if (updates.tags) {
      const hadRedaction = existing.tags.includes('dlp-redacted');
      const newTags = [...updates.tags];

      if (hadRedaction && !newTags.includes('dlp-redacted')) {
        newTags.push('dlp-redacted');
      }
      updates.tags = newTags;
    }

    // Check DLP if content is being updated
    if (updates.content) {
      const { sanitized, detected } = this.sanitizer.sanitize(updates.content);
      updates.content = sanitized;

      if (detected.length > 0) {
        const currentTags = updates.tags || existing.tags || [];
        const finalTags = [...currentTags];

        if (!finalTags.includes('dlp-redacted')) {
          finalTags.push('dlp-redacted');
          updates.tags = finalTags;
        }
      }
    }

    const now = Date.now();
    const updated: Memory = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    if (newVector) {
      updated.vector = newVector;
    }

    const transaction = this.db.transaction(() => {
      // Update memories table
      this.db
        .prepare(
          `
        UPDATE memories
        SET content = ?, tags = ?, confidence = ?, is_verified = ?, updated_at = ?
        WHERE id = ?
      `
        )
        .run(
          updated.content,
          JSON.stringify(updated.tags),
          updated.confidence,
          updated.isVerified ? 1 : 0,
          updated.updatedAt,
          id
        );

      // Update vector if changed
      if (newVector) {
        this.db
          .prepare(
            `
          UPDATE memories_vec
          SET embedding = ?
          WHERE memory_id = ?
        `
          )
          .run(newVector, id);
      }
    });

    transaction();

    const encryptResult = this.encryptContent(updated.content);
    this.recordSyncEvent(
      'UPDATE',
      id,
      encryptResult ? JSON.stringify(encryptResult.encrypted) : undefined,
      encryptResult?.checksum
    );

    return updated;
  }

  /**
   * Delete a memory
   */
  delete(id: string): boolean {
    const existing = this.get(id);
    if (!existing) return false;

    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM memories_vec WHERE memory_id = ?').run(id);
    });

    transaction();

    // Record sync event (tombstone)
    this.recordSyncEvent('DELETE', id);

    return true;
  }

  /**
   * Search memories by vector similarity
   * @param queryVector - The query embedding vector
   * @param limit - Maximum number of results (default: 5)
   * @param options - Search options including projectPath for scope filtering
   */
  search(
    queryVector: Float32Array,
    limit: number = 5,
    options?: SearchOptions
  ): SearchResult[] {
    // Fetch more results if we need to filter by projectPath
    const fetchLimit = options?.projectPath ? limit * 3 : limit;

    // Use sqlite-vec MATCH for KNN search with k constraint
    const rows = this.db
      .prepare(
        `
      SELECT
        v.memory_id,
        v.distance,
        m.id, m.content, m.vector, m.tags, m.source, m.confidence, m.is_verified, m.created_at, m.updated_at
      FROM memories_vec v
      JOIN memories m ON v.memory_id = m.id
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `
      )
      .all(queryVector, fetchLimit) as (MemoryRow & {
      memory_id: string;
      distance: number;
    })[];

    let results = rows.map((row) => ({
      memory: this.rowToMemory(row),
      distance: row.distance,
    }));

    // Filter by projectPath if provided (for project-scoped memories)
    if (options?.projectPath) {
      results = results.filter((r) => {
        const source = r.memory.source;
        if (!source) return true; // Allow memories without source

        // Global plugins: always accessible
        if (source.includes('/.claude/plugins/')) return true;

        // Project-level .claude directory: check if it belongs to current project
        if (source.includes('/.claude/')) {
          const match = source.match(/^(.+)\/\.claude\//);
          if (match) {
            return match[1] === options.projectPath;
          }
        }

        // Other memories (sessions, user-created): always accessible
        return true;
      });
    }

    return results.slice(0, limit);
  }

  /**
   * Hybrid search: combines vector similarity with keyword matching
   */
  hybridSearch(
    queryVector: Float32Array,
    keywords: string[],
    limit: number = 5
  ): SearchResult[] {
    // First, get vector search results
    const vectorResults = this.search(queryVector, limit * 2);

    // Filter by keywords if provided
    if (keywords.length > 0) {
      const keywordLower = keywords.map((k) => k.toLowerCase());
      const filtered = vectorResults.filter((r) => {
        const contentLower = r.memory.content.toLowerCase();
        const tagsLower = r.memory.tags.map((t) => t.toLowerCase());
        return keywordLower.some(
          (kw) =>
            contentLower.includes(kw) || tagsLower.some((t) => t.includes(kw))
        );
      });

      // If we have enough keyword matches, prioritize them
      if (filtered.length >= limit) {
        return filtered.slice(0, limit);
      }

      // Otherwise, return keyword matches first, then fill with vector results
      const remaining = vectorResults.filter(
        (r) => !filtered.some((f) => f.memory.id === r.memory.id)
      );
      return [...filtered, ...remaining].slice(0, limit);
    }

    return vectorResults.slice(0, limit);
  }

  /**
   * List all memories with pagination
   */
  list(
    options: { limit?: number; offset?: number; source?: string } = {}
  ): Memory[] {
    const { limit = 50, offset = 0, source } = options;

    let query = `
      SELECT id, content, vector, tags, source, confidence, is_verified, created_at, updated_at
      FROM memories
    `;
    const params: (string | number)[] = [];

    if (source) {
      query += ' WHERE source = ?';
      params.push(source);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  /**
   * Get total memory count
   */
  count(): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM memories')
      .get() as {
      count: number;
    };
    return result.count;
  }

  /**
   * Delete memories older than a certain time
   */
  deleteOlderThan(timestampMs: number): number {
    const memories = this.db
      .prepare('SELECT id FROM memories WHERE created_at < ?')
      .all(timestampMs) as { id: string }[];

    for (const { id } of memories) {
      this.delete(id);
    }

    return memories.length;
  }

  /**
   * Get sync events since a sequence number
   */
  getSyncEventsSince(sequenceNum: number, limit: number = 100): SyncEvent[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, event_type, memory_id, encrypted_data, checksum, timestamp, sequence_num
      FROM sync_events
      WHERE sequence_num > ?
      ORDER BY sequence_num ASC
      LIMIT ?
    `
      )
      .all(sequenceNum, limit) as SyncEventRow[];

    return rows.map((row) => ({
      id: row.id,
      type: row.event_type as SyncEventType,
      memoryId: row.memory_id,
      encryptedData: row.encrypted_data,
      checksum: row.checksum,
      timestamp: row.timestamp,
      sequenceNum: row.sequence_num,
    }));
  }

  /**
   * Get the latest sequence number
   */
  getLatestSequenceNum(): number {
    const result = this.db
      .prepare('SELECT MAX(sequence_num) as max_seq FROM sync_events')
      .get() as { max_seq: number | null };
    return result.max_seq ?? 0;
  }

  private recordSyncEvent(
    type: SyncEventType,
    memoryId: string,
    encryptedData?: string,
    checksum?: string
  ): void {
    const id = uuidv7();
    const timestamp = Date.now();
    const sequenceNum = this.getLatestSequenceNum() + 1;

    this.db
      .prepare(
        `
      INSERT INTO sync_events (id, event_type, memory_id, encrypted_data, checksum, timestamp, sequence_num)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        type,
        memoryId,
        encryptedData ?? null,
        checksum ?? null,
        timestamp,
        sequenceNum
      );
  }

  /**
   * Convert database row to Memory object
   */
  private rowToMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      content: row.content,
      vector: new Float32Array(row.vector.buffer),
      tags: JSON.parse(row.tags) as string[],
      source: row.source,
      confidence: row.confidence,
      isVerified: row.is_verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// Database row types
interface MemoryRow {
  id: string;
  content: string;
  vector: Buffer;
  tags: string;
  source: string | null;
  confidence: number;
  is_verified: number;
  created_at: number;
  updated_at: number;
}

interface SyncEventRow {
  id: string;
  event_type: string;
  memory_id: string;
  encrypted_data: string | null;
  checksum: string | null;
  timestamp: number;
  sequence_num: number;
}
