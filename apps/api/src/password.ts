import { randomBytes, scrypt as callback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(callback);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, value] = hash.split(':');

  if (!salt || !value) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(value, 'hex');

  return key.length === expected.length && timingSafeEqual(key, expected);
}
