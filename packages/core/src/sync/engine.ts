import { createHmac } from 'node:crypto';
import type {
  SyncConfig,
  SyncStatus,
  PullResponse,
  PushResponse,
  ApiSyncEvent,
  PulledBlob,
} from './types.js';

export interface PullResult {
  events: ApiSyncEvent[];
  blobs: PulledBlob[];
  cursor: number;
  hasMore: boolean;
}

const MIN_BLIND_INDEX_KEY_LENGTH = 32;

export interface BlindIndexConfig {
  key: Buffer;
}

export class SyncEngine {
  private config: SyncConfig | null = null;
  private blindIndexKey: Buffer | null = null;
  private isConnected = false;
  private lastSyncAt: number | null = null;
  private syncCursor = 0;

  configure(config: SyncConfig): void {
    this.config = config;
  }

  configureBlindIndex(config: BlindIndexConfig): void {
    if (!config.key || config.key.length < MIN_BLIND_INDEX_KEY_LENGTH) {
      throw new Error(
        `Blind index key must be at least ${MIN_BLIND_INDEX_KEY_LENGTH} bytes`
      );
    }
    this.blindIndexKey = config.key;
  }

  isBlindIndexConfigured(): boolean {
    return this.blindIndexKey !== null;
  }

  private computeBlindId(memoryId: string): string {
    if (!this.blindIndexKey) {
      throw new Error('Blind index not configured');
    }
    return createHmac('sha256', this.blindIndexKey)
      .update(memoryId)
      .digest('hex');
  }

  async connect(): Promise<void> {
    if (!this.config) {
      throw new Error('Sync engine not configured');
    }
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async pushWithBlindIndex(
    memoryId: string,
    encryptedBlob: string,
    checksum: string
  ): Promise<string> {
    if (!this.blindIndexKey) {
      throw new Error(
        'Blind index not configured. Call configureBlindIndex() first.'
      );
    }
    const blindId = this.computeBlindId(memoryId);
    return this.push(encryptedBlob, checksum, blindId);
  }

  async push(
    encryptedBlob: string,
    checksum: string,
    blindId?: string
  ): Promise<string> {
    const payload: Record<string, string> = { encryptedBlob, checksum };
    if (blindId) {
      payload.blindId = blindId;
    }
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }

    const res = await fetch(`${this.config.apiBaseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Push failed: ${res.status}`);
    }

    const data = (await res.json()) as PushResponse;
    return data.blobId;
  }

  async pull(sinceCursor?: number): Promise<PullResult> {
    if (!this.isConnected || !this.config) {
      throw new Error('Not connected to sync service');
    }

    const cursor = sinceCursor ?? this.syncCursor;
    const url = new URL(`${this.config.apiBaseUrl}/api/sync/pull`);
    url.searchParams.set('cursor', String(cursor));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.config.authToken}` },
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `Pull failed: ${res.status}`);
    }

    const data = (await res.json()) as PullResponse;
    const blobs: PulledBlob[] = [];

    for (const [blobId, base64] of Object.entries(data.blobs)) {
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      blobs.push({ blobId, data: binary.buffer });
    }

    const urlFetches = Object.entries(data.blobUrls).map(
      async ([blobId, signedUrl]) => {
        const blobRes = await fetch(signedUrl);
        if (!blobRes.ok) {
          throw new Error(`Failed to fetch blob ${blobId}: ${blobRes.status}`);
        }
        const arrayBuffer = await blobRes.arrayBuffer();
        return { blobId, data: arrayBuffer };
      }
    );

    const fetchedBlobs = await Promise.all(urlFetches);
    blobs.push(...fetchedBlobs);

    this.syncCursor = data.cursor;
    this.lastSyncAt = Date.now();

    return {
      events: data.events,
      blobs,
      cursor: data.cursor,
      hasMore: data.hasMore,
    };
  }

  async pullAll(): Promise<PulledBlob[]> {
    const allBlobs: PulledBlob[] = [];
    let hasMore = true;

    while (hasMore) {
      const result = await this.pull();
      allBlobs.push(...result.blobs);
      hasMore = result.hasMore;
    }

    return allBlobs;
  }

  getStatus(): SyncStatus {
    return {
      isConnected: this.isConnected,
      lastSyncAt: this.lastSyncAt,
      pendingEvents: 0,
      syncCursor: this.syncCursor,
    };
  }

  updateSyncCursor(cursor: number): void {
    this.syncCursor = cursor;
    this.lastSyncAt = Date.now();
  }
}
