import { generateKeyPairSync, publicEncrypt, privateDecrypt, constants } from 'node:crypto';

const RSA_KEY_SIZE = 4096;

/**
 * RSA key pair with public and private keys in PEM format
 */
export interface RSAKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a 4096-bit RSA key pair
 * @returns RSA key pair with public key in SPKI format and private key in PKCS8 format
 */
export function generateRSAKeyPair(): RSAKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: RSA_KEY_SIZE,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    publicKey,
    privateKey,
  };
}

/**
 * Encrypt data using RSA public key with OAEP padding and SHA-256
 * @param publicKey PEM-formatted public key
 * @param data Data to encrypt
 * @returns Encrypted buffer
 */
export function rsaEncrypt(publicKey: string, data: Buffer): Buffer {
  return publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    data,
  );
}

/**
 * Decrypt data using RSA private key with OAEP padding and SHA-256
 * @param privateKey PEM-formatted private key
 * @param encrypted Encrypted buffer
 * @returns Decrypted buffer
 */
export function rsaDecrypt(privateKey: string, encrypted: Buffer): Buffer {
  return privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encrypted,
  );
}

/**
 * Ensure public key is in PEM format
 * @param publicKey Public key string
 * @returns PEM-formatted public key
 */
export function exportPublicKey(publicKey: string): string {
  if (!publicKey.includes('BEGIN PUBLIC KEY')) {
    throw new Error('Invalid public key format');
  }
  return publicKey;
}

/**
 * Ensure private key is in PEM format
 * @param privateKey Private key string
 * @returns PEM-formatted private key
 */
export function exportPrivateKey(privateKey: string): string {
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Invalid private key format');
  }
  return privateKey;
}
