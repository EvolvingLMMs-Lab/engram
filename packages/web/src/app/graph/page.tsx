'use client';

import dynamic from 'next/dynamic';

import { AppShell } from '@/components/AppShell';

const NeuralGraph = dynamic(
  () => import('@/components/NeuralGraph').then((mod) => mod.NeuralGraph),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] border border-white/10 rounded-lg flex items-center justify-center text-zinc-500 font-mono text-xs">
        INITIALIZING NEURAL GRAPH...
      </div>
    ),
  }
);

export default function GraphPage() {
  return (
    <AppShell title="Neural Graph" badge="VISUALIZATION">
      <div className="h-[calc(100vh-220px)] border border-white/10 rounded-lg overflow-hidden bg-zinc-900/10">
        <NeuralGraph />
      </div>
    </AppShell>
  );
}
