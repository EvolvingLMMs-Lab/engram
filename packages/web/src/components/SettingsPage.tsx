'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Laptop,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Shield,
  HardDrive,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  Link2,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';
import { Device } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { keyToMnemonic } from '@/lib/mnemonic';
import { generateQRCodeDataURL } from '@/lib/qrcode';
import {
  hasStoredKey,
  retrieveKey,
  generateAndStoreKey,
  generateSecureCode,
} from '@/lib/secureKeyStore';

const MOCK_DEVICES: Device[] = [
  {
    id: '1',
    name: 'MacBook Pro',
    lastActive: 'Now',
    status: 'active',
    current: true,
  },
  {
    id: '2',
    name: 'iPhone 15 Pro',
    lastActive: '2h ago',
    status: 'active',
    current: false,
  },
  {
    id: '3',
    name: 'iPad Air',
    lastActive: '5d ago',
    status: 'inactive',
    current: false,
  },
];

export function SettingsPage() {
  const [retentionDays, setRetentionDays] = useState(30);
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState(false);
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    hasStoredKey().then(setHasKey);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setPasswordError('Password required');
      return;
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    setPasswordError('');

    try {
      if (hasKey) {
        const key = await retrieveKey(password);
        if (!key) {
          setPasswordError('Invalid password');
          setIsLoading(false);
          return;
        }
        setRecoveryPhrase(keyToMnemonic(key));
      } else {
        const key = await generateAndStoreKey(password);
        setRecoveryPhrase(keyToMnemonic(key));
        setHasKey(true);
      }
      setIsUnlocked(true);
      setPassword('');
    } catch {
      setPasswordError('Failed to unlock');
    }
    setIsLoading(false);
  }, [password, hasKey]);

  const handleLock = useCallback(() => {
    setIsUnlocked(false);
    setRecoveryPhrase('');
    setShowRecoveryPhrase(false);
  }, []);

  const handleCopyPhrase = useCallback(async () => {
    if (!recoveryPhrase) return;
    await navigator.clipboard.writeText(recoveryPhrase);
    setCopiedPhrase(true);
    setTimeout(() => setCopiedPhrase(false), 2000);
  }, [recoveryPhrase]);

  const handleGenerateLinkCode = useCallback(async () => {
    setGeneratingCode(true);
    const code = generateSecureCode(12);
    const linkUrl = `engram://link?code=${code}`;
    const qrDataUrl = await generateQRCodeDataURL(linkUrl);
    setLinkCode(code);
    setQrCodeDataUrl(qrDataUrl);
    setGeneratingCode(false);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-12 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b border-zinc-900 pb-4">
          <RefreshCw className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-500">
            Sync & Storage
          </h2>
        </div>

        <div className="grid gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border border-zinc-900 hover:border-zinc-800 transition-colors">
            <div className="space-y-1">
              <div className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                <Shield className="w-3 h-3 text-emerald-500" />
                End-to-End Encryption
              </div>
              <div className="text-xs text-zinc-600 max-w-md">
                Zero-knowledge architecture. Keys never leave your device.
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/10 border border-emerald-900/30 text-emerald-500 text-xs font-mono uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3" /> Active
            </div>
          </div>

          <div className="space-y-4 p-4 border border-zinc-900 hover:border-zinc-800 transition-colors">
            <div className="flex items-center gap-2 text-sm font-mono text-zinc-300">
              <HardDrive className="w-3 h-3 text-zinc-500" />
              Local Retention Policy
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group">
                <Input
                  type="number"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                  className="w-24 bg-black border-zinc-800 focus:border-white text-right pr-8 font-mono h-9 rounded-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono pointer-events-none">
                  d
                </span>
              </div>
              <div className="text-xs text-zinc-600 font-mono">
                Memories older than {retentionDays} days are archived to cloud
                storage.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-3">
            <Key className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-500">
              Recovery Phrase
            </h2>
          </div>
          {isUnlocked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLock}
              className="h-7 px-2 text-zinc-500 hover:text-white"
            >
              <Lock className="w-3 h-3 mr-1" />
              Lock
            </Button>
          )}
        </div>

        <div className="p-4 border border-zinc-900 hover:border-zinc-800 transition-colors">
          {!mounted ? (
            <div className="flex items-center gap-2 text-zinc-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading...
            </div>
          ) : !isUnlocked ? (
            <div className="space-y-4">
              <div className="text-xs text-zinc-500 font-mono">
                {hasKey
                  ? 'Enter password to unlock your recovery phrase'
                  : 'Create a password to secure your master key'}
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder={
                    hasKey ? 'Enter password' : 'Create password (min 8 chars)'
                  }
                  className="bg-black border-zinc-800 focus:border-white font-mono h-9 rounded-none flex-1"
                />
                <Button
                  onClick={handleUnlock}
                  disabled={isLoading || password.length < 8}
                  className="bg-white text-black hover:bg-zinc-200 rounded-none uppercase text-xs tracking-wider"
                >
                  {isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Unlock className="w-3 h-3" />
                  )}
                </Button>
              </div>
              {passwordError && (
                <p className="text-xs text-red-500 font-mono">
                  {passwordError}
                </p>
              )}
              <p className="text-xs text-zinc-600">
                Your master key is encrypted with this password and stored
                securely in IndexedDB.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-zinc-500 font-mono">
                  24-word BIP39 recovery phrase
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRecoveryPhrase(!showRecoveryPhrase)}
                    className="h-7 px-2 text-zinc-500 hover:text-white"
                  >
                    {showRecoveryPhrase ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPhrase}
                    className="h-7 px-2 text-zinc-500 hover:text-white"
                  >
                    {copiedPhrase ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 font-mono text-sm">
                {showRecoveryPhrase ? (
                  <p className="text-zinc-300 break-words leading-relaxed">
                    {recoveryPhrase}
                  </p>
                ) : (
                  <p className="text-zinc-600">
                    &#8226;&#8226;&#8226;&#8226;
                    &#8226;&#8226;&#8226;&#8226;&#8226;
                    &#8226;&#8226;&#8226;&#8226;
                    &#8226;&#8226;&#8226;&#8226;&#8226;
                    &#8226;&#8226;&#8226;&#8226;
                    &#8226;&#8226;&#8226;&#8226;&#8226;
                  </p>
                )}
              </div>

              <p className="mt-3 text-xs text-zinc-600">
                Store this phrase securely. It&apos;s the only way to recover
                your memories if you lose access.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b border-zinc-900 pb-4">
          <Link2 className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-500">
            Link New Device
          </h2>
        </div>

        <div className="p-4 border border-zinc-900 hover:border-zinc-800 transition-colors">
          {linkCode ? (
            <div className="text-center space-y-4">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Device link QR code"
                  className="inline-block w-[200px] h-[200px] border border-zinc-800"
                />
              ) : (
                <div className="inline-flex items-center justify-center w-[200px] h-[200px] bg-zinc-900 border border-zinc-800">
                  <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">
                  Device Link Code
                </p>
                <p className="text-2xl font-mono font-bold text-white tracking-widest">
                  {linkCode}
                </p>
              </div>
              <p className="text-xs text-zinc-600">
                Scan the QR code or enter this code on your other device within
                5 minutes.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLinkCode(null);
                  setQrCodeDataUrl(null);
                }}
                className="text-zinc-500 hover:text-white"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-mono text-zinc-300">
                  Sync memories to another device
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  Generate a one-time code to link a new device.
                </p>
              </div>
              <Button
                onClick={handleGenerateLinkCode}
                disabled={generatingCode}
                className="bg-white text-black hover:bg-zinc-200 rounded-none uppercase text-xs tracking-wider"
              >
                {generatingCode ? 'Generating...' : 'Generate Code'}
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b border-zinc-900 pb-4">
          <Laptop className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-500">
            Authorized Devices
          </h2>
        </div>

        <div className="grid gap-1">
          {MOCK_DEVICES.map((device) => (
            <div
              key={device.id}
              className="group flex items-center justify-between p-4 border border-transparent hover:border-zinc-900 hover:bg-zinc-950/30 transition-all"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 bg-zinc-950 border border-zinc-900 ${device.current ? 'text-white border-zinc-800' : 'text-zinc-600'}`}
                >
                  {device.name.toLowerCase().includes('phone') ? (
                    <Smartphone className="w-4 h-4" />
                  ) : (
                    <Laptop className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-mono text-zinc-300 flex items-center gap-3">
                    {device.name}
                    {device.current && (
                      <span className="text-xs bg-white text-black px-1.5 py-0.5 uppercase tracking-wider">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-600 font-mono mt-1">
                    Last active: {device.lastActive}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-600 hover:text-red-500 hover:bg-transparent rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 pt-6">
        <div className="flex items-center gap-3 border-b border-red-900/20 pb-4">
          <AlertTriangle className="w-4 h-4 text-red-900" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-red-900">
            Danger Zone
          </h2>
        </div>

        <div className="flex items-center justify-between p-6 border border-red-900/10 bg-red-950/5 hover:bg-red-950/10 transition-colors">
          <div className="space-y-1">
            <div className="text-sm font-mono text-red-400">
              Nuke All Memories
            </div>
            <div className="text-xs text-red-900/60 font-mono">
              Permanently delete all local and remote data. This action is
              irreversible.
            </div>
          </div>
          <Button
            variant="destructive"
            className="bg-red-950 text-red-500 border border-red-900/30 hover:bg-red-900 hover:text-white rounded-none uppercase text-xs tracking-wider"
          >
            Nuke Data
          </Button>
        </div>
      </section>
    </div>
  );
}
