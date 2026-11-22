import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Ephemeral fallback secret for signed session tokens when SESSION_SECRET env var is unset
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SECRET;
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(plain, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface TokenPayload {
  role: 'admin' | 'participant';
  sub: number;
  deviceToken?: string;
  exp: number;
}

export function signAuthToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  auth?: TokenPayload;
}

export function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export function requireParticipantAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Sesi login peserta tidak ditemukan.' });
  }
  const payload = verifyAuthToken(token);
  if (!payload || payload.role !== 'participant') {
    return res.status(401).json({ error: 'Token sesi peserta tidak valid atau telah kedaluwarsa.' });
  }
  req.auth = payload;
  next();
}

export function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: silakan login sebagai Pengawas/Admin.' });
  }
  const payload = verifyAuthToken(token);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Token Admin/Proktor tidak valid atau kedaluwarsa.' });
  }
  req.auth = payload;
  next();
}
