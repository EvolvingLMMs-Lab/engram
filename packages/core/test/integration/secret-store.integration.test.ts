import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/memory/database';
import { SecretStore } from '../../src/secrets/store';
import { CryptoService } from '../../src/crypto/service';

describe('Secret Store Integration', () => {
  let db: Database.Database;
  let masterKey: Buffer;
  let crypto: CryptoService;
  let store: SecretStore;

  beforeEach(() => {
    db = initDatabase(':memory:');
    masterKey = CryptoService.generateMasterKey();
    crypto = new CryptoService(masterKey);
    store = new SecretStore(db, crypto);
    store.init();
  });

  afterEach(() => {
    db.close();
  });

  // ── CRUD lifecycle ───────────────────────────────────────────────

  describe('Full CRUD lifecycle', () => {
    it('should set and get a secret', async () => {
      await store.set('API_KEY', 'my-secret-value', 'Test API key');
      const value = store.get('API_KEY');
      expect(value).toBe('my-secret-value');
    });

    it('should update an existing secret', async () => {
      await store.set('API_KEY', 'original-value');
      await store.set('API_KEY', 'updated-value');

      const value = store.get('API_KEY');
      expect(value).toBe('updated-value');
    });

    it('should delete a secret', async () => {
      await store.set('API_KEY', 'to-delete');
      const deleted = await store.delete('API_KEY');
      expect(deleted).toBe(true);

      const value = store.get('API_KEY');
      expect(value).toBeNull();
    });

    it('should return false when deleting a non-existent secret', async () => {
      const deleted = await store.delete('DOES_NOT_EXIST');
      expect(deleted).toBe(false);
    });

    it('should list all secrets', async () => {
      await store.set('KEY_A', 'value-a', 'Description A');
      await store.set('KEY_B', 'value-b', 'Description B');
      await store.set('KEY_C', 'value-c');

      const secrets = store.list();
      expect(secrets).toHaveLength(3);

      // Listed in alphabetical order by key
      expect(secrets[0].key).toBe('KEY_A');
      expect(secrets[1].key).toBe('KEY_B');
      expect(secrets[2].key).toBe('KEY_C');

      expect(secrets[0].description).toBe('Description A');
      expect(secrets[2].description).toBeNull();
    });
  });

  // ── Encryption verification ──────────────────────────────────────

  describe('Encryption at rest', () => {
    it('should store ciphertext, not plaintext, in the database', async () => {
      const plainValue = 'super-secret-plaintext-value';
      await store.set('ENCRYPTED_KEY', plainValue);

      // Directly query the raw database
      const row = db
        .prepare('SELECT encrypted_value, iv FROM secrets WHERE key_name = ?')
        .get('ENCRYPTED_KEY') as { encrypted_value: string; iv: string };

      expect(row).toBeDefined();
      // The stored value should NOT be the plaintext
      expect(row.encrypted_value).not.toBe(plainValue);
      // It should be base64-ish ciphertext
      expect(row.encrypted_value).toContain('.');
      // IV should also be stored
      expect(row.iv).toBeDefined();
      expect(row.iv.length).toBeGreaterThan(0);
    });

    it('should fail to decrypt with a different master key', async () => {
      await store.set('ISOLATED_KEY', 'protected-value');

      // Create a new store with a different master key
      const otherKey = CryptoService.generateMasterKey();
      const otherCrypto = new CryptoService(otherKey);
      const otherStore = new SecretStore(db, otherCrypto);
      otherStore.init();

      // Trying to read with wrong key should throw
      expect(() => otherStore.get('ISOLATED_KEY')).toThrow();
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle special characters in values', async () => {
      const specialValue = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~';
      await store.set('SPECIAL_CHARS', specialValue);
      expect(store.get('SPECIAL_CHARS')).toBe(specialValue);
    });

    it('should handle very long values', async () => {
      const longValue = 'x'.repeat(100_000);
      await store.set('LONG_VALUE', longValue);
      expect(store.get('LONG_VALUE')).toBe(longValue);
    });

    it('should reject empty string values (padding underflow)', async () => {
      // CryptoService padding requires at least some data;
      // empty string causes negative randomBytes size
      await expect(store.set('EMPTY', '')).rejects.toThrow();
    });

    it('should handle Unicode and emoji values', async () => {
      const unicodeValue = '你好世界 🌍🔐 こんにちは мир';
      await store.set('UNICODE', unicodeValue);
      expect(store.get('UNICODE')).toBe(unicodeValue);
    });
  });

  // ── IV uniqueness ────────────────────────────────────────────────

  describe('IV uniqueness per secret', () => {
    it('should use different IVs for different secrets', async () => {
      await store.set('SECRET_1', 'same-value');
      await store.set('SECRET_2', 'same-value');

      const row1 = db
        .prepare('SELECT iv FROM secrets WHERE key_name = ?')
        .get('SECRET_1') as { iv: string };
      const row2 = db
        .prepare('SELECT iv FROM secrets WHERE key_name = ?')
        .get('SECRET_2') as { iv: string };

      expect(row1.iv).not.toBe(row2.iv);
    });
  });
});
