import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface SyncEvent {
  id: string;
  user_id: string;
  blob_id: string;
  event_type: 'ADD' | 'UPDATE' | 'DELETE';
  blind_id?: string;
  sequence_num: number;
  created_at: string;
}

export type SyncEventHandler = (event: SyncEvent) => void;

export class RealtimeSync {
  private client = createClient(supabaseUrl, supabaseAnonKey);
  private channel: RealtimeChannel | null = null;
  private handlers: Set<SyncEventHandler> = new Set();

  async subscribe(userId: string): Promise<void> {
    if (this.channel) {
      await this.unsubscribe();
    }

    this.channel = this.client
      .channel(`sync:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sync_events',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const event = payload.new as SyncEvent;
          this.handlers.forEach((handler) => handler(event));
        }
      )
      .subscribe();
  }

  async unsubscribe(): Promise<void> {
    if (this.channel) {
      await this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  onSyncEvent(handler: SyncEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.channel !== null;
  }
}

export const realtimeSync = new RealtimeSync();
