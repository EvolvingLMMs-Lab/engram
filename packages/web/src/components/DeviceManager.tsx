'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Laptop,
  Trash2,
  Loader2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name?: string;
  createdAt: number;
  lastSeen?: number;
  isCurrentDevice?: boolean;
}

interface DevicesResponse {
  devices: Device[];
}

const DeviceSkeleton = () => (
  <div className="animate-pulse">
    {[1, 2].map((i) => (
      <div key={i} className="border-b border-white/5 p-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-zinc-900 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-zinc-900 rounded" />
            <div className="h-3 w-24 bg-zinc-900 rounded" />
          </div>
          <div className="h-8 w-20 bg-zinc-900 rounded" />
        </div>
      </div>
    ))}
  </div>
);

export function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/devices');
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
      const data: DevicesResponse = await res.json();
      setDevices(data.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRevoke = async (deviceId: string, deviceName?: string) => {
    const name = deviceName || deviceId.slice(0, 8);
    if (!confirm(`Revoke access for "${name}"? This device will no longer be able to access your vault.`)) {
      return;
    }

    try {
      setRevokingId(deviceId);
      const res = await fetch(`/api/devices?id=${deviceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke device');
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!mounted) return '--/--/----';
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDeviceIcon = (name?: string) => {
    const lowerName = (name || '').toLowerCase();
    if (lowerName.includes('phone') || lowerName.includes('mobile') || lowerName.includes('iphone') || lowerName.includes('android')) {
      return Smartphone;
    }
    return Laptop;
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-zinc-950/50">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-900/30">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
            Authorized Devices
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchDevices}
          disabled={loading}
          className="h-7 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
        >
          <RefreshCw className={cn('w-3 h-3 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-950/20 border-b border-white/10 text-red-500 text-sm font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto">
        {loading && devices.length === 0 ? (
          <DeviceSkeleton />
        ) : devices.length > 0 ? (
          <div className="divide-y divide-white/5">
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device.name);
              return (
                <div
                  key={device.id}
                  className="group p-5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center border transition-colors',
                      device.isCurrentDevice
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-zinc-900/50 border-white/5 text-zinc-500 group-hover:text-zinc-400'
                    )}>
                      <DeviceIcon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-200 font-medium truncate">
                          {device.name || `Device ${device.id.slice(0, 8)}`}
                        </span>
                        {device.isCurrentDevice && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider" suppressHydrationWarning>
                          Added {formatDate(device.createdAt)}
                        </span>
                        {device.lastSeen && (
                          <span className="text-[10px] font-mono text-zinc-700" suppressHydrationWarning>
                            Last seen {formatDate(device.lastSeen)}
                          </span>
                        )}
                      </div>
                    </div>

                    {!device.isCurrentDevice && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(device.id, device.name)}
                        disabled={revokingId === device.id}
                        className={cn(
                          'h-8 text-[10px] font-mono uppercase tracking-wider rounded-md px-3 transition-all',
                          'opacity-0 group-hover:opacity-100',
                          'text-zinc-600 hover:text-red-400 hover:bg-red-500/10'
                        )}
                      >
                        {revokingId === device.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3 mr-2" />
                            Revoke
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          !loading && (
            <div className="py-12 px-8 text-center">
              <Laptop className="w-8 h-8 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500 font-mono text-sm mb-2">No devices authorized</p>
              <p className="text-zinc-700 text-xs max-w-sm mx-auto">
                Use the CLI to authorize this device for vault access
              </p>
            </div>
          )
        )}
      </div>

      {devices.length > 0 && (
        <div className="px-5 py-3 border-t border-white/5 bg-zinc-900/20">
          <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
            {devices.length} device{devices.length !== 1 ? 's' : ''} authorized
          </p>
        </div>
      )}
    </div>
  );
}
