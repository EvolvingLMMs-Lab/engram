import { createHmac, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { CryptoService } from '../crypto/service.js';
import { rsaEncrypt } from '../crypto/rsa.js';

export interface SecretsSyncConfig {
  apiBaseUrl: string;
  authToken: string;
}

const MIN_BLIND_INDEX_KEY_LENGTH = 32;

export class SecretsSyncEngine {
  private config: SecretsSyncConfig | null = null;
  private db: Database.Database;
  private vaultKey: Buffer | null = null;
  private blindIndexKey: Buffer | null = null;
  private isConnected = false;
  private syncCursor = 0;

  constructor(db: Database.Database) {
    this.db = db;
    this.syncCursor = this.loadSyncCursor();
  }

  configure(config: SecretsSyncConfig): void {
    this.config = config;
  }

  setVaultKey(vaultKey: Buffer): void {
    if (vaultKey.length !== 32) {
      throw new Error('Vault key must be 32 bytes (256 bits)');
    }
    this.vaultKey = vaultKey;
  }

  configureBlindIndex(key: Buffer): void {
    if (!key || key.length < MIN_BLIND_INDEX_KEY_LENGTH) {
      throw new Error(
        `Blind index key must be at least ${MIN_BLIND_INDEX_KEY_LENGTH} bytes`
      );
    }
    this.blindIndexKey = key;
  }

  isBlindIndexConfigured(): boolean {
    return this.blindIndexKey !== null;
  }

  async connect(): Promise<void> {
    if (!this.config) {
      throw new Error('Secrets sync engine not configured');
    }
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  private computeBlindId(keyName: string): string {
    if (!this.blindIndexKey) {
      throw new Error('Blind index not configured');
    }
    return createHmac('sha256', this.blindIndexKey)
      .update(keyName)
      .digest('hex');
  }

  async pushSecret(
    secretId: string,
    keyName: string,
    value: string
  ): Promise<void> {
    if (!this.vaultKey) {
      throw new Error('Vault key not set');
    }
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }
    if (!this.blindIndexKey) {
      throw new Error('Blind index not configured');
    }

    const crypto = new CryptoService(this.vaultKey);
    const encrypted = crypto.encrypt(value);
    const checksum = CryptoService.sha256(value);
    const blindId = this.computeBlindId(keyName);

    const res = await fetch(`${this.config.apiBaseUrl}/api/secrets/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify({
        secretId,
        eventType: 'ADD',
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        checksum,
        blindId,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Push failed: ${res.status}`);
    }

    this.recordLocalEvent(
      'ADD',
      secretId,
      encrypted.ciphertext,
      encrypted.iv,
      checksum,
      blindId
    );
  }

  async deleteSecret(secretId: string, keyName: string): Promise<void> {
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }
    if (!this.blindIndexKey) {
      throw new Error('Blind index not configured');
    }

    const blindId = this.computeBlindId(keyName);

    const res = await fetch(`${this.config.apiBaseUrl}/api/secrets/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify({
        secretId,
        eventType: 'DELETE',
        blindId,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Delete failed: ${res.status}`);
    }

    this.recordLocalEvent('DELETE', secretId, '', '', '', blindId);
  }

  async pullSecrets(): Promise<{ secretId: string; value: string; eventType: string }[]> {
    if (!this.vaultKey) {
      throw new Error('Vault key not set');
    }
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }

    const url = new URL(`${this.config.apiBaseUrl}/api/secrets/pull`);
    url.searchParams.set('cursor', String(this.syncCursor));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.config.authToken}` },
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Pull failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      events: Array<{
        secretId: string;
        eventType: string;
        encryptedData?: string;
        iv?: string;
        checksum?: string;
      }>;
      cursor: number;
    };

    const crypto = new CryptoService(this.vaultKey);
    const results: { secretId: string; value: string; eventType: string }[] = [];

    for (const event of data.events) {
      if (event.eventType === 'DELETE') {
        results.push({ secretId: event.secretId, value: '', eventType: 'DELETE' });
      } else {
        if (!event.encryptedData || !event.iv) {
          throw new Error(`Missing encrypted data for secret ${event.secretId}`);
        }

        const decrypted = crypto.decrypt({
          ciphertext: event.encryptedData,
          iv: event.iv,
        });

        if (event.checksum && CryptoService.sha256(decrypted) !== event.checksum) {
          throw new Error(`Checksum mismatch for secret ${event.secretId}`);
        }

        results.push({ secretId: event.secretId, value: decrypted, eventType: event.eventType });
      }
    }

    this.syncCursor = data.cursor;
    this.saveSyncCursor(data.cursor);

    return results;
  }

  async authorizeDevice(deviceId: string, devicePublicKey: string): Promise<void> {
    if (!this.vaultKey) {
      throw new Error('Vault key not set');
    }
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }

    const encryptedVaultKey = rsaEncrypt(devicePublicKey, this.vaultKey);

    const res = await fetch(`${this.config.apiBaseUrl}/api/devices/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify({
        deviceId,
        encryptedVaultKey: encryptedVaultKey.toString('base64'),
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Authorization failed: ${res.status}`);
    }
  }

  async revokeDevice(deviceId: string): Promise<void> {
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }

    const res = await fetch(
      `${this.config.apiBaseUrl}/api/devices/${deviceId}/revoke`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.authToken}`,
        },
      }
    );

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Revoke failed: ${res.status}`);
    }
  }

  getStatus(): { isConnected: boolean; syncCursor: number } {
    return {
      isConnected: this.isConnected,
      syncCursor: this.syncCursor,
    };
  }

  updateSyncCursor(cursor: number): void {
    this.syncCursor = cursor;
    this.saveSyncCursor(cursor);
  }

  private recordLocalEvent(
    eventType: string,
    secretId: string,
    encryptedData: string,
    iv: string,
    checksum: string,
    blindId: string
  ): void {
    const id = randomUUID();
    const timestamp = Date.now();
    const sequenceNum = this.getNextLocalSequence();

    this.db
      .prepare(
        `
      INSERT INTO local_secret_sync_events 
      (id, event_type, secret_id, encrypted_data, iv, checksum, blind_id, timestamp, sequence_num)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        eventType,
        secretId,
        encryptedData,
        iv,
        checksum,
        blindId,
        timestamp,
        sequenceNum
      );
  }

  private getNextLocalSequence(): number {
    const result = this.db
      .prepare('SELECT MAX(sequence_num) as max_seq FROM local_secret_sync_events')
      .get() as { max_seq: number | null };
    return (result.max_seq ?? 0) + 1;
  }

  private saveSyncCursor(cursor: number): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO secret_sync_state (key, value)
      VALUES ('sync_cursor', ?)
    `
      )
      .run(String(cursor));
  }

  private loadSyncCursor(): number {
    try {
      const result = this.db
        .prepare("SELECT value FROM secret_sync_state WHERE key = 'sync_cursor'")
        .get() as { value: string } | undefined;
      return result ? parseInt(result.value, 10) : 0;
    } catch {
      return 0;
    }
  }
}
