import { split, combine } from 'shamir-secret-sharing';

/**
 * Represents a single share in a recovery kit
 */
export interface RecoveryShare {
  index: number;
  data: string; // base64 encoded share data
}

/**
 * Complete recovery kit containing all shares needed to recover a vault key
 */
export interface RecoveryKit {
  userId: string;
  totalShares: number;
  threshold: number;
  shares: RecoveryShare[];
  createdAt: number;
}

/**
 * Split a 256-bit key into N shares using Shamir Secret Sharing
 * @param key - The key to split (must be 32 bytes)
 * @param shares - Total number of shares to create
 * @param threshold - Minimum shares needed to recover the key
 * @returns Array of share buffers
 * @throws Error if key is not 32 bytes or threshold > shares
 */
export async function splitKey(
  key: Buffer,
  shares: number,
  threshold: number
): Promise<Uint8Array[]> {
  if (key.length !== 32) {
    throw new Error(`Key must be 32 bytes, got ${key.length}`);
  }

  if (threshold > shares) {
    throw new Error(`Threshold (${threshold}) cannot exceed shares (${shares})`);
  }

  if (threshold < 2) {
    throw new Error('Threshold must be at least 2');
  }

  if (shares < 2) {
    throw new Error('Must create at least 2 shares');
  }

  // shamir-secret-sharing expects Uint8Array
  const keyArray = new Uint8Array(key);
  const splitShares = split(keyArray, shares, threshold);

  return splitShares;
}

/**
 * Combine K or more shares to recover the original key
 * @param shares - Array of shares (must have at least threshold shares)
 * @returns Recovered key as Buffer
 * @throws Error if shares are invalid or insufficient
 */
export async function combineShares(shares: Uint8Array[]): Promise<Buffer> {
  if (!shares || shares.length === 0) {
    throw new Error('Must provide at least one share');
  }

  try {
    const recovered = await combine(shares);
    return Buffer.from(recovered);
  } catch (error) {
    throw new Error(
      `Failed to combine shares: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate a recovery kit from a vault key
 * @param vaultKey - The vault key to protect (must be 32 bytes)
 * @param userId - User ID for the recovery kit
 * @param shares - Total number of shares (default: 5)
 * @param threshold - Minimum shares needed to recover (default: 3)
 * @returns Recovery kit with encoded shares
 */
export async function generateRecoveryKit(
  vaultKey: Buffer,
  userId: string,
  shares = 5,
  threshold = 3
): Promise<RecoveryKit> {
  const splitShares = await splitKey(vaultKey, shares, threshold);

  const recoveryShares: RecoveryShare[] = splitShares.map((share, index) => ({
    index,
    data: Buffer.from(share).toString('base64'),
  }));

  return {
    userId,
    totalShares: shares,
    threshold,
    shares: recoveryShares,
    createdAt: Date.now(),
  };
}

/**
 * Recover vault key from recovery shares
 * @param shares - Array of recovery shares (must have at least threshold shares)
 * @returns Recovered vault key as Buffer
 * @throws Error if shares are invalid or insufficient
 */
export async function recoverFromKit(shares: RecoveryShare[]): Promise<Buffer> {
  if (!shares || shares.length === 0) {
    throw new Error('Must provide at least one share');
  }

  try {
    // Decode base64 shares back to Uint8Array
    const decodedShares = shares.map((share) => {
      const buffer = Buffer.from(share.data, 'base64');
      return new Uint8Array(buffer);
    });

    return await combineShares(decodedShares);
  } catch (error) {
    throw new Error(
      `Failed to recover from kit: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
