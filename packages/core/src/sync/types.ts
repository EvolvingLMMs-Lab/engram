export interface SyncConfig {
  apiBaseUrl: string;
  authToken: string;
}

export interface SyncStatus {
  isConnected: boolean;
  lastSyncAt: number | null;
  pendingEvents: number;
  syncCursor: number;
}

export interface ApiSyncEvent {
  id: string;
  event_type: 'ADD' | 'UPDATE' | 'DELETE';
  blob_id: string | null;
  sequence_num: number;
  created_at: string;
}

export interface PullResponse {
  events: ApiSyncEvent[];
  blobs: Record<string, string>;
  blobUrls: Record<string, string>;
  cursor: number;
  hasMore: boolean;
}

export interface PushResponse {
  blobId: string;
  storagePath: string;
}

export interface PulledBlob {
  blobId: string;
  data: ArrayBuffer;
}
