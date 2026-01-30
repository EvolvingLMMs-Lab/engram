import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SecretStore } from '../../src/secrets/store';
import { CryptoService } from '../../src/crypto/service';

// Mock CryptoService
vi.mock('../../src/crypto/service', () => {
  return {
    CryptoService: vi.fn().mockImplementation(() => ({
      encrypt: vi.fn().mockReturnValue({ ciphertext: 'encrypted', iv: 'iv' }),
      decrypt: vi.fn().mockReturnValue('decrypted-value'),
    })),
  };
});

describe('SecretStore', () => {
  let db: Database.Database;
  let store: SecretStore;
  let crypto: CryptoService;

  beforeEach(() => {
    db = new Database(':memory:');
    crypto = new CryptoService(Buffer.alloc(32));
    store = new SecretStore(db, crypto);
    store.init();
  });

  it('should set and get a secret', () => {
    store.set('TEST_KEY', 'secret_value');

    const row = db
      .prepare('SELECT * FROM secrets WHERE key_name = ?')
      .get('TEST_KEY') as any;
    expect(row).toBeDefined();
    expect(row.encrypted_value).toBe('encrypted');

    const val = store.get('TEST_KEY');
    expect(val).toBe('decrypted-value');
  });

  it('should update existing secret', () => {
    store.set('TEST_KEY', 'val1');
    store.set('TEST_KEY', 'val2');

    const count = db.prepare('SELECT COUNT(*) as c FROM secrets').get() as any;
    expect(count.c).toBe(1);
  });

  it('should delete a secret', async () => {
    await store.set('TEST_KEY', 'val1');
    const deleted = await store.delete('TEST_KEY');
    expect(deleted).toBe(true);

    const val = store.get('TEST_KEY');
    expect(val).toBeNull();
  });

  it('should list secrets', () => {
    store.set('KEY1', 'val1', 'Desc 1');
    store.set('KEY2', 'val2');

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.key).toBe('KEY1');
    expect(list[0]?.description).toBe('Desc 1');
  });
});
