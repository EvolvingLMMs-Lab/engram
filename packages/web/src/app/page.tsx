'use client';

import {
  Activity,
  Network,
  Settings as SettingsIcon,
  Copy,
  Check,
  Cloud,
  Database,
  Plug,
  Key,
  Terminal,
  Shield,
  Lock,
  Fingerprint,
  ServerCrash,
  Eye,
  FileKey,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/stream', icon: Activity, label: 'Stream' },
  { href: '/graph', icon: Network, label: 'Graph' },
  { href: '/settings', icon: SettingsIcon, label: 'Settings' },
];

const features = [
  {
    icon: Shield,
    title: 'AES-256-GCM',
    desc: 'Military-grade authenticated encryption with 256-bit keys.',
  },
  {
    icon: Lock,
    title: 'Zero-Knowledge',
    desc: 'Server never sees plaintext. All encryption happens client-side.',
  },
  {
    icon: Key,
    title: 'PBKDF2-SHA256',
    desc: '600,000 iterations for key derivation. Brute-force resistant.',
  },
  {
    icon: Fingerprint,
    title: 'Blind Indexing',
    desc: 'HMAC-SHA256 indexes enable search without exposing content.',
  },
  {
    icon: Cloud,
    title: 'E2EE Sync',
    desc: 'Encrypted payloads sync across devices. Keys never leave you.',
  },
  {
    icon: Database,
    title: 'Local-First',
    desc: 'SQLite + sqlite-vec on your machine. Offline-capable.',
  },
  {
    icon: FileKey,
    title: 'BIP39 Recovery',
    desc: '24-word mnemonic phrase. Recover your vault anywhere.',
  },
  {
    icon: Plug,
    title: 'MCP Native',
    desc: 'Works with Claude Desktop, Cursor, and OpenCode.',
  },
  {
    icon: Eye,
    title: 'Forward Secrecy',
    desc: 'Unique nonces per message. Compromise one, not all.',
  },
  {
    icon: ServerCrash,
    title: 'Server Breach Safe',
    desc: 'Even if servers are compromised, your data stays encrypted.',
  },
];

const steps = [
  {
    step: '01',
    title: 'Install',
    type: 'command' as const,
  },
  {
    step: '02',
    title: 'Connect',
    type: 'text' as const,
    content: 'Add MCP server to Claude Desktop, Cursor, or OpenCode config.',
  },
  {
    step: '03',
    title: 'Remember',
    type: 'text' as const,
    content:
      'AI memories stored locally with E2EE sync across all your devices.',
  },
];

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText('npx engram init');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-200 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] bg-emerald-900/10 blur-[120px] rounded-full mix-blend-screen opacity-20"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

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
            {navItems.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                asChild
                className="relative h-8 px-4 text-xs font-mono uppercase tracking-wider transition-all duration-200 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              >
                <Link href={item.href}>
                  <item.icon className="w-3.5 h-3.5 mr-2 opacity-70" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col z-10 relative">
        <section className="relative flex-1 flex flex-col justify-center py-16 md:py-24">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-0 items-center max-w-6xl mx-auto">
              <div className="animate-in fade-in slide-in-from-left-8 duration-1000 lg:pr-16">
                <h1 className="text-6xl md:text-7xl lg:text-8xl font-light tracking-tighter text-white mb-10">
                  Engram<span className="text-emerald-500">.</span>
                </h1>

                <div className="relative pl-6 mb-10">
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500/80 to-emerald-500/10"></div>
                  <div className="text-xl md:text-2xl font-mono font-light text-zinc-500 flex flex-col items-start leading-relaxed">
                    <span>Biological memory fades.</span>
                    <span>Digital memory leaks.</span>
                    <span>
                      <span className="text-white">We fixed both.</span>
                      <span className="inline-block w-3 h-6 bg-emerald-500 ml-2 animate-blink align-middle"></span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-8 text-lg font-mono tracking-wide">
                  <p>
                    <span className="text-white font-bold">MEMORY</span>{' '}
                    <span className="italic text-zinc-500 font-light">
                      /for AI/
                    </span>
                  </p>
                  <div className="w-px h-5 bg-zinc-700"></div>
                  <p>
                    <span className="text-white font-bold">PRIVACY</span>{' '}
                    <span className="italic text-zinc-500 font-light">
                      /by design/
                    </span>
                  </p>
                </div>
              </div>

              <div className="relative lg:pl-16 animate-in fade-in slide-in-from-right-8 duration-1000 delay-200">
                <div className="absolute left-0 top-0 bottom-0 w-px bg-zinc-800 hidden lg:block"></div>

                <div className="border border-white/10 p-8 bg-black/50">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-mono text-emerald-500">
                        {steps[activeStep].step}
                      </span>
                      <h4 className="text-xl font-light text-white">
                        {steps[activeStep].title}
                      </h4>
                    </div>
                    <div className="flex gap-2">
                      {steps.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveStep(i)}
                          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                            i === activeStep
                              ? 'bg-emerald-500 w-8'
                              : 'bg-zinc-700 w-1.5 hover:bg-zinc-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="min-h-[80px] flex flex-col justify-center">
                    {steps[activeStep].type === 'command' ? (
                      <button
                        onClick={handleCopyCommand}
                        className="inline-flex items-center gap-3 px-4 py-3 bg-black border border-white/10 hover:border-emerald-500/30 transition-colors cursor-pointer w-fit"
                      >
                        <Terminal className="w-5 h-5 text-emerald-500" />
                        <code className="font-mono text-base text-zinc-300">
                          npx engram init
                        </code>
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                        )}
                      </button>
                    ) : (
                      <p className="text-base text-zinc-400 font-mono leading-relaxed">
                        {steps[activeStep].content}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <section className="border-t border-white/10 py-8 overflow-hidden z-10 bg-black">
        <div className="flex animate-marquee hover:[animation-play-state:paused]">
          {[...features, ...features].map((feature, i) => (
            <div key={i} className="flex-shrink-0 w-96 px-8 py-4 group">
              <div className="flex items-start gap-5">
                <feature.icon
                  className="w-8 h-8 text-zinc-600 group-hover:text-emerald-400 transition-colors flex-shrink-0 mt-1"
                  strokeWidth={1.5}
                />
                <div>
                  <h3 className="text-xl font-medium text-zinc-200 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-base text-zinc-500 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-6 text-center border-t border-white/5 z-10 bg-black">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-6 text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            SYSTEM ONLINE
          </div>
          <div className="mt-4 md:mt-0">
            ENGRAM v0.1.0 • ENCRYPTED MEMORY LAYER
          </div>
        </div>
      </footer>
    </div>
  );
}
