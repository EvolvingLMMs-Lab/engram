'use client';

import { useEffect, useCallback, useState } from 'react';
import { realtimeSync, type SyncEvent } from '@/lib/realtime';
import { useAuth } from '@/components/AuthProvider';

export function useRealtimeSync(onEvent?: (event: SyncEvent) => void) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);

  const handleEvent = useCallback(
    (event: SyncEvent) => {
      setLastEvent(event);
      onEvent?.(event);
    },
    [onEvent]
  );

  useEffect(() => {
    if (!user?.id) {
      setIsConnected(false);
      return;
    }

    realtimeSync.subscribe(user.id).then(() => {
      setIsConnected(true);
    });

    const unsubscribe = realtimeSync.onSyncEvent(handleEvent);

    return () => {
      unsubscribe();
      realtimeSync.unsubscribe().then(() => {
        setIsConnected(false);
      });
    };
  }, [user?.id, handleEvent]);

  return {
    isConnected,
    lastEvent,
  };
}
