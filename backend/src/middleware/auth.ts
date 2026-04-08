import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/client';

export interface AuthPayload { userId: string; phone: string; role: string; }
export interface RefreshPayload { userId: string; tokenId: string; type: 'refresh'; }
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      requestId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthPayload;
    query('SELECT role, is_active FROM users WHERE id = $1', [payload.userId])
      .then((r) => {
        const row = r.rows[0];
        if (!row) return res.status(401).json({ error: 'User not found' });
        if (row.is_active === false) return res.status(403).json({ error: 'Account is banned' });
        req.user = { ...payload, role: row.role || payload.role };
        return next();
      })
      .catch(() => res.status(500).json({ error: 'Auth verification failed' }));
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Missing auth user' });

    try {
      // Use latest role from DB so role changes apply immediately without re-login.
      const r = await query('SELECT role FROM users WHERE id = $1', [req.user.userId]);
      const currentRole = r.rows[0]?.role || req.user.role;
      req.user.role = currentRole;

      if (!roles.includes(currentRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    } catch {
      return res.status(500).json({ error: 'Role verification failed' });
    }
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' } as jwt.SignOptions);
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!) as RefreshPayload;
}
