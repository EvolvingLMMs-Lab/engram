'use client';

import dynamic from 'next/dynamic';

import { AppShell } from '@/components/AppShell';

const MemoryStream = dynamic(
  () => import('@/components/MemoryStream').then((mod) => mod.MemoryStream),
  {
    ssr: false,
    loading: () => (
      <div className="border border-white/10 rounded-lg p-8 text-center text-zinc-500 font-mono text-xs">
        LOADING MEMORY STREAM...
      </div>
    ),
  }
);

export default function StreamPage() {
  return (
    <AppShell title="Memory Stream" badge="LIVE">
      <MemoryStream />
    </AppShell>
  );
}
