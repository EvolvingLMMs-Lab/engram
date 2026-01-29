import keytar from 'keytar';

import { CryptoService } from './service.js';
import type { EncryptedData } from '../types.js';

const SERVICE_NAME = 'engram';
const MASTER_KEY_ACCOUNT = 'master-key';
const VAULT_KEY_ACCOUNT = 'vault-key';
const DEVICE_PUBLIC_KEY_ACCOUNT = 'device-public-key';
const DEVICE_PRIVATE_KEY_ACCOUNT = 'device-private-key-encrypted';

export class KeyManager {
  // ============ Master Key Methods ============

  async storeMasterKey(key: Buffer): Promise<void> {
    await keytar.setPassword(
      SERVICE_NAME,
      MASTER_KEY_ACCOUNT,
      key.toString('base64')
    );
  }

  async getMasterKey(): Promise<Buffer | null> {
    const keyB64 = await keytar.getPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);
    if (!keyB64) return null;
    return Buffer.from(keyB64, 'base64');
  }

  /**
   * Retrieve master key or throw if not found
   */
  async retrieveMasterKey(): Promise<Buffer> {
    const key = await this.getMasterKey();
    if (!key) {
      throw new Error(
        'Master Key not found in keychain. Run `engram init` first.'
      );
    }
    return key;
  }

  async deleteMasterKey(): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);
  }

  async hasMasterKey(): Promise<boolean> {
    const key = await keytar.getPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);
    return key !== null;
  }

  // ============ Vault Key Methods ============

  async storeVaultKey(key: Buffer): Promise<void> {
    await keytar.setPassword(
      SERVICE_NAME,
      VAULT_KEY_ACCOUNT,
      key.toString('base64')
    );
  }

  async getVaultKey(): Promise<Buffer | null> {
    const keyB64 = await keytar.getPassword(SERVICE_NAME, VAULT_KEY_ACCOUNT);
    if (!keyB64) return null;
    return Buffer.from(keyB64, 'base64');
  }

  async hasVaultKey(): Promise<boolean> {
    const key = await keytar.getPassword(SERVICE_NAME, VAULT_KEY_ACCOUNT);
    return key !== null;
  }

  async deleteVaultKey(): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, VAULT_KEY_ACCOUNT);
  }

  // ============ Device Key Pair Methods ============

  async storeDeviceKeyPair(
    publicKey: string,
    privateKey: string,
    masterKey: Buffer
  ): Promise<void> {
    // Store public key directly
    await keytar.setPassword(
      SERVICE_NAME,
      DEVICE_PUBLIC_KEY_ACCOUNT,
      publicKey
    );

    // Encrypt private key with master key before storage
    const crypto = new CryptoService(masterKey);
    const encrypted = crypto.encrypt(privateKey);
    await keytar.setPassword(
      SERVICE_NAME,
      DEVICE_PRIVATE_KEY_ACCOUNT,
      JSON.stringify(encrypted)
    );
  }

  async getDeviceKeyPair(
    masterKey: Buffer
  ): Promise<{ publicKey: string; privateKey: string } | null> {
    // Get public key directly
    const publicKey = await keytar.getPassword(
      SERVICE_NAME,
      DEVICE_PUBLIC_KEY_ACCOUNT
    );
    if (!publicKey) return null;

    // Get and decrypt private key
    const encryptedJson = await keytar.getPassword(
      SERVICE_NAME,
      DEVICE_PRIVATE_KEY_ACCOUNT
    );
    if (!encryptedJson) return null;

    try {
      const encrypted: EncryptedData = JSON.parse(encryptedJson);
      const crypto = new CryptoService(masterKey);
      const privateKey = crypto.decrypt(encrypted);

      return { publicKey, privateKey };
    } catch (error) {
      throw new Error(
        `Failed to decrypt device private key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async hasDeviceKeyPair(): Promise<boolean> {
    const publicKey = await keytar.getPassword(
      SERVICE_NAME,
      DEVICE_PUBLIC_KEY_ACCOUNT
    );
    const privateKey = await keytar.getPassword(
      SERVICE_NAME,
      DEVICE_PRIVATE_KEY_ACCOUNT
    );
    return publicKey !== null && privateKey !== null;
  }

  async deleteDeviceKeyPair(): Promise<boolean> {
    const publicDeleted = await keytar.deletePassword(
      SERVICE_NAME,
      DEVICE_PUBLIC_KEY_ACCOUNT
    );
    const privateDeleted = await keytar.deletePassword(
      SERVICE_NAME,
      DEVICE_PRIVATE_KEY_ACCOUNT
    );
    return publicDeleted && privateDeleted;
  }
}
