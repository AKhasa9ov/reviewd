import { randomBytes } from 'node:crypto';

export type IdPrefix = 'rev' | 'rnd' | 'cmt' | 'evt' | 'snap' | 'anc' | 'sub' | 'job';

export type RandomBytes = (length: number) => Uint8Array;

export class ReviewIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewIdError';
  }
}

const PREFIXES = new Set<IdPrefix>(['rev', 'rnd', 'cmt', 'evt', 'snap', 'anc', 'sub', 'job']);
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const RANDOM_BYTES = 10;
const MAX_TIME = 0xffffffffffff;

function encodeFixed(value: number, length: number): string {
  let remaining = value;
  let out = '';
  for (let index = 0; index < length; index++) {
    out = CROCKFORD[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function encodeBytes(bytes: Uint8Array): string {
  let accumulator = 0;
  let bits = 0;
  let out = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(accumulator << (5 - bits)) & 31];
  return out;
}

function defaultRandom(length: number): Uint8Array {
  return randomBytes(length);
}

/**
 * Creates a ULID-like id: 48-bit millisecond timestamp + 80 bits of randomness,
 * prefixed with a domain tag. Fixed-width Crockford base32 keeps ids sortable.
 */
export function createId(
  prefix: IdPrefix,
  now: () => Date = () => new Date(),
  random: RandomBytes = defaultRandom,
): string {
  if (!PREFIXES.has(prefix)) {
    throw new ReviewIdError(`unknown id prefix: ${String(prefix)}`);
  }

  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new ReviewIdError('clock returned an invalid date');
  }
  const time = date.getTime();
  if (time < 0 || time > MAX_TIME) {
    throw new ReviewIdError(`clock is outside the 48-bit millisecond range: ${time}`);
  }

  const bytes = random(RANDOM_BYTES);
  if (!(bytes instanceof Uint8Array) || bytes.length !== RANDOM_BYTES) {
    throw new ReviewIdError(`random source must return ${RANDOM_BYTES} bytes`);
  }

  const timePart = encodeFixed(time, TIME_LENGTH);
  const randomPart = encodeBytes(bytes);
  return `${prefix}_${timePart}${randomPart}`;
}

export const ID_LENGTHS = {
  time: TIME_LENGTH,
  random: RANDOM_LENGTH,
  total: TIME_LENGTH + RANDOM_LENGTH,
} as const;
