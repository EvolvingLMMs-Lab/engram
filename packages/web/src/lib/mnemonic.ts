import * as bip39 from 'bip39';

/**
 * Convert a 32-byte master key to a BIP39 mnemonic phrase (24 words)
 */
export function keyToMnemonic(key: Uint8Array): string {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes for 24-word mnemonic');
  }
  return bip39.entropyToMnemonic(Buffer.from(key).toString('hex'));
}

/**
 * Convert a BIP39 mnemonic phrase back to a 32-byte master key
 */
export function mnemonicToKey(mnemonic: string): Uint8Array {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  const entropy = bip39.mnemonicToEntropy(mnemonic);
  return hexToBytes(entropy);
}

/**
 * Validate a BIP39 mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Generate a new random mnemonic and corresponding key
 */
export function generateMnemonic(): { mnemonic: string; key: Uint8Array } {
  const mnemonic = bip39.generateMnemonic(256); // 24 words
  const key = mnemonicToKey(mnemonic);
  return { mnemonic, key };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
