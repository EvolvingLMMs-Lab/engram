import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryStore } from '../../src/memory/store';

// Mock DLPSanitizer
vi.mock('../../src/security/dlp', () => {
  return {
    DLPSanitizer: vi.fn().mockImplementation(() => ({
      sanitize: vi.fn().mockImplementation((text) => {
        if (text.includes('sk-')) {
          return {
            sanitized: text.replace(/sk-\d+/, '{{SECRET}}'),
            detected: ['OpenAI API Key'],
          };
        }
        return { sanitized: text, detected: [] };
      }),
    })),
  };
});

describe('MemoryStore Integration with DLP', () => {
  let db: Database.Database;
  let store: MemoryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    // Initialize schema with mock vector table
    db.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        tags TEXT,
        source TEXT,
        confidence REAL DEFAULT 0.5,
        is_verified INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE memories_vec (
        memory_id TEXT,
        embedding BLOB
      );
      CREATE TABLE sync_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        memory_id TEXT,
        encrypted_data TEXT,
        checksum TEXT,
        timestamp INTEGER,
        sequence_num INTEGER
      );
    `);
    store = new MemoryStore(db);
  });

  it('should redact secrets on create', () => {
    const input = {
      content: 'Here is my key: sk-12345',
      tags: ['test'],
    };
    const vector = new Float32Array(384);

    const memory = store.create(input, vector);

    expect(memory.content).toBe('Here is my key: {{SECRET}}');
    expect(memory.tags).toContain('dlp-redacted');
    expect(memory.tags).toContain('test');
  });

  it('should redact secrets on update', () => {
    const input = {
      content: 'Clean content',
      tags: ['initial'],
    };
    const vector = new Float32Array(384);
    const memory = store.create(input, vector);

    const updated = store.update(memory.id, {
      content: 'Updated with key: sk-99999',
    });

    expect(updated).not.toBeNull();
    expect(updated!.content).toBe('Updated with key: {{SECRET}}');
    expect(updated!.tags).toContain('dlp-redacted');
    expect(updated!.tags).toContain('initial');
  });
});
