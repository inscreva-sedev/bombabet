import crypto from 'node:crypto';

export interface GeneratedCrash {
  crashPoint: number;
  hash: string;
}

/**
 * Generates an authoritative server-side crash point using crypto.randomBytes.
 * Keeps ~3% house edge at 1.00x and heavy-tailed distribution capped at 150.00x.
 */
export function generateCrashPoint(roundId: number): GeneratedCrash {
  const bytes = crypto.randomBytes(8);
  const intVal = bytes.readBigUInt64BE(0);
  const maxUint64 = BigInt('18446744073709551616'); // 2^64
  const r = Number(intVal) / Number(maxUint64); // [0, 1)

  let crashPoint: number;
  if (r < 0.03) {
    crashPoint = 1.0;
  } else {
    const raw = 0.97 / (1 - r);
    crashPoint = Math.min(150.0, Math.max(1.01, Math.floor(raw * 100) / 100));
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${roundId}:${crashPoint.toFixed(2)}:${salt}`)
    .digest('hex');

  return { crashPoint, hash };
}
