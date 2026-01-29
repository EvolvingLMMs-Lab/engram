'use client';

import dynamic from 'next/dynamic';

import { AppShell } from '@/components/AppShell';

const SettingsPage = dynamic(
  () => import('@/components/SettingsPage').then((mod) => mod.SettingsPage),
  {
    ssr: false,
    loading: () => (
      <div className="border border-white/10 rounded-lg p-8 text-center text-zinc-500 font-mono text-xs">
        LOADING SETTINGS...
      </div>
    ),
  }
);

export default function SettingsRoute() {
  return (
    <AppShell title="System Configuration" badge="CONTROL PANEL">
      <div className="w-full">
        <SettingsPage />
      </div>
    </AppShell>
  );
}
