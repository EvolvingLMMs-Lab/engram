import type Database from 'better-sqlite3';
import { v7 as uuidv7 } from 'uuid';
import type { CryptoService } from '../crypto/service.js';
import type { SecretsSyncEngine } from './syncEngine.js';

export interface Secret {
  id: string;
  key: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SecretStoreOptions {
  syncEngine?: SecretsSyncEngine;
  enableSync?: boolean;
}

export class SecretStore {
  private syncEngine: SecretsSyncEngine | null = null;
  private syncEnabled = false;

  constructor(
    private db: Database.Database,
    private crypto: CryptoService,
    options?: SecretStoreOptions
  ) {
    if (options?.syncEngine) {
      this.syncEngine = options.syncEngine;
      this.syncEnabled = options.enableSync ?? true;
    }
  }

  setSyncEngine(engine: SecretsSyncEngine): void {
    this.syncEngine = engine;
  }

  enableSync(enabled: boolean): void {
    this.syncEnabled = enabled;
  }

  isSyncEnabled(): boolean {
    return this.syncEnabled && this.syncEngine !== null;
  }

  /**
   * Initialize secrets table if not exists
   */
  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY,
        key_name TEXT NOT NULL UNIQUE,
        encrypted_value TEXT NOT NULL,
        iv TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Set a secret value (with optional cloud sync)
   */
  async set(key: string, value: string, description?: string): Promise<void> {
    const now = Date.now();

    const { ciphertext, iv } = this.crypto.encrypt(value);

    const existing = this.db
      .prepare('SELECT id FROM secrets WHERE key_name = ?')
      .get(key) as { id: string } | undefined;

    let secretId: string;

    if (existing) {
      secretId = existing.id;
      this.db
        .prepare(
          `
        UPDATE secrets 
        SET encrypted_value = ?, iv = ?, description = COALESCE(?, description), updated_at = ?
        WHERE key_name = ?
      `
        )
        .run(ciphertext, iv, description, now, key);
    } else {
      secretId = uuidv7();
      this.db
        .prepare(
          `
        INSERT INTO secrets (id, key_name, encrypted_value, iv, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(secretId, key, ciphertext, iv, description, now, now);
    }

    if (this.isSyncEnabled() && this.syncEngine) {
      try {
        await this.syncEngine.pushSecret(secretId, key, value);
      } catch (error) {
        console.error(
          `Failed to sync secret "${key}":`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  /**
   * Get a secret value
   */
  get(key: string): string | null {
    const row = this.db
      .prepare(
        `
      SELECT encrypted_value, iv FROM secrets WHERE key_name = ?
    `
      )
      .get(key) as { encrypted_value: string; iv: string } | undefined;

    if (!row) return null;

    try {
      return this.crypto.decrypt({
        ciphertext: row.encrypted_value,
        iv: row.iv,
      });
    } catch (error) {
      throw new Error(
        `Failed to decrypt secret ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all secret keys
   */
  list(): Secret[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, key_name, description, created_at, updated_at FROM secrets ORDER BY key_name ASC
    `
      )
      .all() as {
      id: string;
      key_name: string;
      description: string;
      created_at: number;
      updated_at: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      key: row.key_name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Delete a secret (with optional cloud sync)
   */
  async delete(key: string): Promise<boolean> {
    const existing = this.db
      .prepare('SELECT id FROM secrets WHERE key_name = ?')
      .get(key) as { id: string } | undefined;

    if (!existing) {
      return false;
    }

    const result = this.db
      .prepare('DELETE FROM secrets WHERE key_name = ?')
      .run(key);

    if (result.changes > 0 && this.isSyncEnabled() && this.syncEngine) {
      try {
        await this.syncEngine.deleteSecret(existing.id, key);
      } catch (error) {
        console.error(
          `Failed to sync delete for "${key}":`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    return result.changes > 0;
  }
}
