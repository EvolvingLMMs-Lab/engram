import {
  encryptWithPassword,
  decryptWithPassword,
  generateRandomKey,
  keyToHex,
  hexToKey,
  type EncryptedData,
} from './crypto';

const DB_NAME = 'engram-keys';
const DB_VERSION = 1;
const STORE_NAME = 'master-keys';
const KEY_ID = 'primary';

interface StoredKey {
  id: string;
  encryptedKey: EncryptedData;
  createdAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function storeEncryptedKey(
  masterKey: Uint8Array,
  password: string
): Promise<void> {
  const keyHex = keyToHex(masterKey);
  const encryptedKey = await encryptWithPassword(keyHex, password);

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const storedKey: StoredKey = {
      id: KEY_ID,
      encryptedKey,
      createdAt: Date.now(),
    };

    const request = store.put(storedKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    tx.oncomplete = () => db.close();
  });
}

export async function retrieveKey(
  password: string
): Promise<Uint8Array | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(KEY_ID);

    request.onerror = () => reject(request.error);
    request.onsuccess = async () => {
      const stored = request.result as StoredKey | undefined;
      if (!stored) {
        resolve(null);
        return;
      }

      try {
        const keyHex = await decryptWithPassword(stored.encryptedKey, password);
        resolve(hexToKey(keyHex));
      } catch {
        resolve(null);
      }
    };

    tx.oncomplete = () => db.close();
  });
}

export async function hasStoredKey(): Promise<boolean> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(KEY_ID);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(!!request.result);

    tx.oncomplete = () => db.close();
  });
}

export async function deleteStoredKey(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(KEY_ID);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    tx.oncomplete = () => db.close();
  });
}

export async function generateAndStoreKey(
  password: string
): Promise<Uint8Array> {
  const key = generateRandomKey();
  await storeEncryptedKey(key, password);
  return key;
}

export function generateSecureCode(length: number = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, length)
    .toUpperCase();
}
