import { describe, it, expect } from 'vitest';
import {
  CryptoService,
  generateRecoveryPhrase,
  validateRecoveryPhrase,
  phraseToKey,
  generateRSAKeyPair,
  rsaEncrypt,
  rsaDecrypt,
  splitKey,
  combineShares,
  generateRecoveryKit,
  recoverFromKit,
} from '../../src/crypto/index';

describe('Crypto Integration', () => {
  // ── Recovery Phrase ──────────────────────────────────────────────

  describe('Recovery phrase → key derivation → encrypt/decrypt', () => {
    it('should generate a valid 24-word recovery phrase', () => {
      const phrase = generateRecoveryPhrase();
      const words = phrase.split(' ');
      expect(words).toHaveLength(24);
      expect(validateRecoveryPhrase(phrase)).toBe(true);
    });

    it('should derive a deterministic 32-byte key from a phrase', () => {
      const phrase = generateRecoveryPhrase();
      const key1 = phraseToKey(phrase);
      const key2 = phraseToKey(phrase);
      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });

    it('should derive different keys from different phrases', () => {
      const phrase1 = generateRecoveryPhrase();
      const phrase2 = generateRecoveryPhrase();
      const key1 = phraseToKey(phrase1);
      const key2 = phraseToKey(phrase2);
      expect(key1.equals(key2)).toBe(false);
    });

    it('should encrypt and decrypt using phrase-derived key', () => {
      const phrase = generateRecoveryPhrase();
      const key = phraseToKey(phrase);
      const crypto = new CryptoService(key);

      const plaintext = 'Secret data protected by recovery phrase';
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should reject invalid recovery phrases', () => {
      expect(validateRecoveryPhrase('hello world')).toBe(false);
      expect(validateRecoveryPhrase('')).toBe(false);
      expect(() => phraseToKey('not a valid phrase')).toThrow('Invalid recovery phrase');
    });
  });

  // ── RSA ──────────────────────────────────────────────────────────

  describe('RSA key pair → wrap/unwrap vault key → use for AES', () => {
    it('should generate RSA key pair and encrypt/decrypt vault key', () => {
      const { publicKey, privateKey } = generateRSAKeyPair();
      const vaultKey = CryptoService.generateMasterKey();

      const wrapped = rsaEncrypt(publicKey, vaultKey);
      const unwrapped = rsaDecrypt(privateKey, wrapped);

      expect(unwrapped).toEqual(vaultKey);
    });

    it('should use RSA-unwrapped key for CryptoService encrypt/decrypt', () => {
      const { publicKey, privateKey } = generateRSAKeyPair();
      const vaultKey = CryptoService.generateMasterKey();

      // Wrap with RSA
      const wrapped = rsaEncrypt(publicKey, vaultKey);
      // Unwrap on another device
      const unwrapped = rsaDecrypt(privateKey, wrapped);

      const crypto = new CryptoService(unwrapped);
      const plaintext = 'Cross-device encrypted memory';
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt with wrong private key', () => {
      const pair1 = generateRSAKeyPair();
      const pair2 = generateRSAKeyPair();
      const vaultKey = CryptoService.generateMasterKey();

      const wrapped = rsaEncrypt(pair1.publicKey, vaultKey);
      expect(() => rsaDecrypt(pair2.privateKey, wrapped)).toThrow();
    });
  });

  // ── Shamir Secret Sharing ────────────────────────────────────────

  describe('Shamir split → threshold recover → decrypt', () => {
    it('should split and recover key with exact threshold shares', async () => {
      const key = CryptoService.generateMasterKey();
      const shares = await splitKey(key, 5, 3);

      expect(shares).toHaveLength(5);

      // Use exactly 3 shares (threshold)
      const recovered = await combineShares(shares.slice(0, 3));
      expect(recovered).toEqual(key);
    });

    it('should recover with more than threshold shares', async () => {
      const key = CryptoService.generateMasterKey();
      const shares = await splitKey(key, 5, 3);

      // Use 4 shares (more than threshold)
      const recovered = await combineShares(shares.slice(0, 4));
      expect(recovered).toEqual(key);
    });

    it('should use recovered key for encryption/decryption', async () => {
      const key = CryptoService.generateMasterKey();
      const shares = await splitKey(key, 5, 3);

      const recovered = await combineShares(shares.slice(0, 3));
      const crypto = new CryptoService(recovered);

      const plaintext = 'Shamir-protected secret';
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should generate and recover from recovery kit', async () => {
      const vaultKey = CryptoService.generateMasterKey();
      const kit = await generateRecoveryKit(vaultKey, 'user-123', 5, 3);

      expect(kit.userId).toBe('user-123');
      expect(kit.totalShares).toBe(5);
      expect(kit.threshold).toBe(3);
      expect(kit.shares).toHaveLength(5);

      // Recover using 3 shares
      const recovered = await recoverFromKit(kit.shares.slice(0, 3));
      expect(recovered).toEqual(vaultKey);

      // Use recovered key
      const crypto = new CryptoService(recovered);
      const encrypted = crypto.encrypt('Recovery test');
      expect(crypto.decrypt(encrypted)).toBe('Recovery test');
    });
  });

  // ── Full lifecycle ──────────────────────────────────────────────

  describe('Full lifecycle: phrase → key → Shamir → RSA → encrypt/decrypt', () => {
    it('should complete the entire crypto pipeline', async () => {
      // 1. Generate recovery phrase and derive key
      const phrase = generateRecoveryPhrase();
      const masterKey = phraseToKey(phrase);

      // 2. Split master key with Shamir
      const shares = await splitKey(masterKey, 5, 3);

      // 3. Generate RSA key pair for device
      const { publicKey, privateKey } = generateRSAKeyPair();

      // 4. Wrap master key with RSA for device storage
      const wrappedKey = rsaEncrypt(publicKey, masterKey);

      // 5. Simulate device recovery: unwrap master key
      const unwrappedKey = rsaDecrypt(privateKey, wrappedKey);
      expect(unwrappedKey).toEqual(masterKey);

      // 6. Also recover from Shamir shares
      const shamirRecovered = await combineShares(shares.slice(1, 4));
      expect(shamirRecovered).toEqual(masterKey);

      // 7. Use any recovered key for encryption
      const crypto = new CryptoService(unwrappedKey);
      const plaintext = 'Full lifecycle test data';
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ── IV randomness ──────────────────────────────────────────────

  describe('IV randomness', () => {
    it('should produce different ciphertexts for the same plaintext', () => {
      const key = CryptoService.generateMasterKey();
      const crypto = new CryptoService(key);
      const plaintext = 'Identical plaintext';

      const encrypted1 = crypto.encrypt(plaintext);
      const encrypted2 = crypto.encrypt(plaintext);

      // IVs must differ
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Ciphertexts must differ
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      // But both decrypt to the same plaintext
      expect(crypto.decrypt(encrypted1)).toBe(plaintext);
      expect(crypto.decrypt(encrypted2)).toBe(plaintext);
    });
  });
});
