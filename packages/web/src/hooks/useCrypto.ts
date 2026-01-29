'use client';

import { useState, useCallback } from 'react';
import {
  encrypt,
  decrypt,
  importMasterKey,
  type EncryptedData,
} from '@/lib/crypto';

export function useCrypto() {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const unlock = useCallback(async (keyBytes: Uint8Array) => {
    const key = await importMasterKey(keyBytes);
    setMasterKey(key);
    setIsUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    setMasterKey(null);
    setIsUnlocked(false);
  }, []);

  const encryptData = useCallback(
    async (plaintext: string): Promise<EncryptedData | null> => {
      if (!masterKey) return null;
      return encrypt(plaintext, masterKey);
    },
    [masterKey]
  );

  const decryptData = useCallback(
    async (encrypted: EncryptedData): Promise<string | null> => {
      if (!masterKey) return null;
      try {
        return await decrypt(encrypted, masterKey);
      } catch {
        return null;
      }
    },
    [masterKey]
  );

  return {
    isUnlocked,
    unlock,
    lock,
    encryptData,
    decryptData,
  };
}
