import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/memory/database';
import { MemoryStore } from '../../src/memory/store';
import { CryptoService } from '../../src/crypto/service';
import type { SyncEvent, EncryptedData } from '../../src/types';

/**
 * Generate a deterministic, normalized 384-dim vector from a seed.
 * Avoids the need to load EmbeddingService for non-pipeline tests.
 */
function makeVector(seed: number): Float32Array {
  const v = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    // Simple deterministic pseudo-random based on seed and index
    v[i] = Math.sin(seed * 1000 + i) * Math.cos(i * 0.1 + seed);
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < 384; i++) v[i] /= norm;
  return v;
}

describe('Memory Store Integration', () => {
  let db: Database.Database;
  let masterKey: Buffer;
  let crypto: CryptoService;
  let store: MemoryStore;

  beforeEach(() => {
    db = initDatabase(':memory:');
    masterKey = CryptoService.generateMasterKey();
    crypto = new CryptoService(masterKey);
    store = new MemoryStore(db, crypto);
  });

  afterEach(() => {
    db.close();
  });

  // ── Encrypted CRUD ───────────────────────────────────────────────

  describe('Encrypted CRUD lifecycle', () => {
    it('should create a memory and read it back', () => {
      const vec = makeVector(1);
      const memory = store.create({ content: 'Hello world', tags: ['test'] }, vec);

      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('Hello world');
      expect(memory.tags).toContain('test');

      const fetched = store.get(memory.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.content).toBe('Hello world');
    });

    it('should update a memory', () => {
      const vec = makeVector(2);
      const memory = store.create({ content: 'Original' }, vec);

      const updated = store.update(memory.id, { content: 'Updated content' });
      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('Updated content');

      const fetched = store.get(memory.id);
      expect(fetched!.content).toBe('Updated content');
    });

    it('should delete a memory', () => {
      const vec = makeVector(3);
      const memory = store.create({ content: 'To be deleted' }, vec);

      const deleted = store.delete(memory.id);
      expect(deleted).toBe(true);

      const fetched = store.get(memory.id);
      expect(fetched).toBeNull();
    });

    it('should generate sync events for CREATE, UPDATE, DELETE', () => {
      const vec = makeVector(4);
      const memory = store.create({ content: 'Sync test' }, vec);
      store.update(memory.id, { content: 'Updated sync' });
      store.delete(memory.id);

      const events = store.getSyncEventsSince(0);
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('ADD');
      expect(events[1].type).toBe('UPDATE');
      expect(events[2].type).toBe('DELETE');
    });
  });

  // ── Sync event checksum verification ─────────────────────────────

  describe('Sync event checksum', () => {
    it('should store SHA256 checksum in sync events', () => {
      const vec = makeVector(5);
      const content = 'Checksum verification content';
      store.create({ content }, vec);

      const events = store.getSyncEventsSince(0);
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.checksum).toBeDefined();
      expect(event.checksum).toBe(CryptoService.sha256(content));
    });

    it('should include encrypted data in sync events', () => {
      const vec = makeVector(6);
      store.create({ content: 'Encrypted sync data' }, vec);

      const events = store.getSyncEventsSince(0);
      const event = events[0];
      expect(event.encryptedData).toBeDefined();
      expect(event.encryptedData).not.toBeNull();

      // The encrypted data should be parseable JSON containing ciphertext and iv
      const parsed = JSON.parse(event.encryptedData!) as EncryptedData;
      expect(parsed.ciphertext).toBeDefined();
      expect(parsed.iv).toBeDefined();

      // Decrypt and verify
      const decrypted = crypto.decrypt(parsed);
      expect(decrypted).toBe('Encrypted sync data');
    });
  });

  // ── DLP pipeline ─────────────────────────────────────────────────

  describe('DLP sanitization pipeline', () => {
    it('should detect and redact OpenAI API key', () => {
      const vec = makeVector(10);
      const fakeKey = 'sk-' + 'a'.repeat(48);
      const memory = store.create(
        { content: `My key is ${fakeKey}` },
        vec,
      );

      expect(memory.content).toContain('{{SECRET:OPENAI_KEY}}');
      expect(memory.content).not.toContain(fakeKey);
      expect(memory.tags).toContain('dlp-redacted');
    });

    it('should detect and redact Stripe live key', () => {
      const vec = makeVector(11);
      // Construct to avoid GitHub push protection
      const stripeKey = 'sk_live_' + 'FakeTestKeyAbcdef01234567';
      const memory = store.create(
        { content: `Stripe: ${stripeKey}` },
        vec,
      );

      expect(memory.content).toContain('{{SECRET:STRIPE_LIVE_KEY}}');
      expect(memory.content).not.toContain(stripeKey);
      expect(memory.tags).toContain('dlp-redacted');
    });

    it('should detect and redact AWS access key', () => {
      const vec = makeVector(12);
      const awsKey = 'AKIAIOSFODNN7EXAMPLE';
      const memory = store.create(
        { content: `AWS: ${awsKey}` },
        vec,
      );

      expect(memory.content).toContain('{{SECRET:AWS_ACCESS_KEY}}');
      expect(memory.content).not.toContain(awsKey);
      expect(memory.tags).toContain('dlp-redacted');
    });

    it('should detect and redact private key blocks', () => {
      const vec = makeVector(13);
      const privateKeyBlock = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy5AiJQGb
-----END RSA PRIVATE KEY-----`;
      const memory = store.create(
        { content: `Key: ${privateKeyBlock}` },
        vec,
      );

      expect(memory.content).toContain('{{SECRET:PRIVATE_KEY_BLOCK}}');
      expect(memory.content).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(memory.tags).toContain('dlp-redacted');
    });

    it('should store sanitized content in sync event encrypted data', () => {
      const vec = makeVector(14);
      const fakeKey = 'sk-' + 'b'.repeat(48);
      store.create({ content: `Secret: ${fakeKey}` }, vec);

      const events = store.getSyncEventsSince(0);
      const parsed = JSON.parse(events[0].encryptedData!) as EncryptedData;
      const decrypted = crypto.decrypt(parsed);

      // Sync event should contain sanitized content, not original
      expect(decrypted).toContain('{{SECRET:OPENAI_KEY}}');
      expect(decrypted).not.toContain(fakeKey);
    });
  });

  // ── Vector search ────────────────────────────────────────────────

  describe('sqlite-vec vector search', () => {
    it('should return results ordered by similarity', () => {
      const v1 = makeVector(100);
      const v2 = makeVector(200);
      const v3 = makeVector(300);

      store.create({ content: 'Alpha' }, v1);
      store.create({ content: 'Beta' }, v2);
      store.create({ content: 'Gamma' }, v3);

      // Query with v1 — should rank Alpha closest
      const results = store.search(v1, 3);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].memory.content).toBe('Alpha');
      // Distances should be ascending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.create({ content: `Memory ${i}` }, makeVector(i + 400));
      }

      const results = store.search(makeVector(400), 3);
      expect(results).toHaveLength(3);
    });

    it('should support hybrid search with keyword filtering', () => {
      store.create({ content: 'TypeScript is great for web dev', tags: ['typescript'] }, makeVector(500));
      store.create({ content: 'Python is used for data science', tags: ['python'] }, makeVector(501));
      store.create({ content: 'Rust ensures memory safety', tags: ['rust'] }, makeVector(502));

      const results = store.hybridSearch(makeVector(500), ['typescript'], 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
      // The TypeScript memory should be in results since keyword matches
      const tsResult = results.find(r => r.memory.content.includes('TypeScript'));
      expect(tsResult).toBeDefined();
    });
  });

  // ── Cross-device sync simulation ─────────────────────────────────

  describe('Cross-device sync: applyEncryptedSyncEvent', () => {
    it('should reconstruct a memory from sync event', () => {
      const vec = makeVector(600);
      const originalContent = 'Cross-device memory content';
      const memory = store.create({ content: originalContent }, vec);

      // Get the sync event
      const events = store.getSyncEventsSince(0);
      const addEvent = events.find(e => e.type === 'ADD')!;

      // Simulate receiving on a new device with same crypto key
      const db2 = initDatabase(':memory:');
      const store2 = new MemoryStore(db2, crypto);

      store2.applyEncryptedSyncEvent(addEvent, vec);

      const reconstructed = store2.get(memory.id);
      expect(reconstructed).not.toBeNull();
      expect(reconstructed!.content).toBe(originalContent);

      db2.close();
    });
  });

  // ── Tamper detection ─────────────────────────────────────────────

  describe('Tamper detection', () => {
    it('should reject tampered sync event (checksum mismatch)', () => {
      const vec = makeVector(700);
      store.create({ content: 'Original content' }, vec);

      const events = store.getSyncEventsSince(0);
      const event = events[0];

      // Tamper with the encrypted data — replace with encryption of different content
      const tamperedEncrypted = crypto.encrypt('TAMPERED content');
      const tamperedEvent: SyncEvent = {
        ...event,
        encryptedData: JSON.stringify(tamperedEncrypted),
        // Keep the original checksum (which won't match)
      };

      const db2 = initDatabase(':memory:');
      const store2 = new MemoryStore(db2, crypto);

      expect(() => {
        store2.applyEncryptedSyncEvent(tamperedEvent, vec);
      }).toThrow('Checksum mismatch');

      db2.close();
    });
  });
});
