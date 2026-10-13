import jwt from 'jsonwebtoken';
import argon2 from 'argon2';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export async function hashPassword(plain: string) {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' } as jwt.SignOptions);
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; username: string };
  } catch {
    return null;
  }
}

export { calcMissing, parseDateOnly } from './calc';
