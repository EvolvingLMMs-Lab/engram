import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

import type { EncryptedData } from '../types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PADDING_BLOCK_SIZE = 4096;

export class CryptoService {
  private masterKey: Buffer;

  constructor(masterKey: Buffer) {
    if (masterKey.length !== 32) {
      throw new Error('Master key must be 32 bytes (256 bits)');
    }
    this.masterKey = masterKey;
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = randomBytes(IV_LENGTH);
    const paddedPlaintext = this.addPadding(plaintext);

    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    let encrypted = cipher.update(paddedPlaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();
    const ciphertext = encrypted + '.' + authTag.toString('base64');

    return {
      ciphertext,
      iv: iv.toString('base64'),
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const parts = encryptedData.ciphertext.split('.');
    const encrypted = parts[0];
    const authTagB64 = parts[1];

    if (!encrypted || !authTagB64) {
      throw new Error('Invalid ciphertext format');
    }

    const authTag = Buffer.from(authTagB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return this.removePadding(decrypted);
  }

  static generateMasterKey(): Buffer {
    return randomBytes(32);
  }

  static sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private addPadding(data: string): string {
    const dataBuffer = Buffer.from(data, 'utf8');
    const paddedLength = Math.ceil(dataBuffer.length / PADDING_BLOCK_SIZE) * PADDING_BLOCK_SIZE;
    const padding = randomBytes(paddedLength - dataBuffer.length - 4);

    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(dataBuffer.length);

    return Buffer.concat([lengthBuffer, dataBuffer, padding]).toString('base64');
  }

  private removePadding(paddedData: string): string {
    const buffer = Buffer.from(paddedData, 'base64');
    const originalLength = buffer.readUInt32BE(0);
    return buffer.subarray(4, 4 + originalLength).toString('utf8');
  }
}
