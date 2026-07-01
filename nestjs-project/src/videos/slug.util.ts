import { randomBytes } from 'node:crypto';

const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LENGTH = 11;

export function generateVideoSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  return Array.from(bytes, (byte) => CHARSET[byte % CHARSET.length]).join('');
}
