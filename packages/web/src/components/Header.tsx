'use client';

import { Activity, Network, Settings as SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/stream', icon: Activity, label: 'Stream' },
  { href: '/graph', icon: Network, label: 'Graph' },
  { href: '/settings', icon: SettingsIcon, label: 'Settings' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/10 sticky top-0 z-50 bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 group cursor-pointer select-none"
        >
          <div className="relative">
            <div className="absolute -inset-1 bg-emerald-500 rounded-sm animate-glow-breathe"></div>
            <div className="relative h-8 w-8 bg-black border border-emerald-500/60 rounded-sm text-emerald-400 flex items-center justify-center text-sm font-mono font-bold">
              En
            </div>
          </div>
          <span className="font-mono text-sm tracking-wide text-zinc-200 group-hover:text-emerald-400 transition-colors">
            ENGRAM
          </span>
        </Link>

        <nav className="flex items-center gap-px bg-white/5 p-1 border border-white/10 rounded-lg">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                asChild
                className={`
                  relative h-8 px-4 text-xs font-mono uppercase tracking-wider transition-all duration-200 rounded-md
                  ${
                    isActive
                      ? 'text-emerald-400 bg-emerald-900/20'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                  }
                `}
              >
                <Link href={item.href}>
                  <item.icon className="w-3.5 h-3.5 mr-2 opacity-70" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
