'use client';

import { Header } from './Header';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  badge?: string;
}

export function AppShell({ children, title, badge }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-200 font-sans selection:bg-emerald-500/30">
      <Header />

      <main className="flex-1 flex flex-col">
        <div className="container mx-auto px-6 py-8 flex-1 flex flex-col">
          <div className="mb-6 flex items-end gap-4 border-b border-white/10 pb-4">
            <h1 className="text-2xl font-light text-zinc-200">{title}</h1>
            {badge && (
              <span className="text-xs font-mono text-emerald-500/50 mb-1">
                {badge}
              </span>
            )}
          </div>
          <div className="flex-1">{children}</div>
        </div>
      </main>

      <footer className="py-6 text-center border-t border-white/5 bg-black">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-6 text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            SYSTEM ONLINE
          </div>
          <div className="mt-2 md:mt-0">ENGRAM v0.1.0</div>
        </div>
      </footer>
    </div>
  );
}
