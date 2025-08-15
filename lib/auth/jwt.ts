import jwt from 'jsonwebtoken';
import { User } from '../models/user';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export function generateAccessToken(user: Partial<User>): string {
  const payload: JWTPayload = {
    userId: user._id!,
    tenantId: user.tenantId!,
    role: user.role!,
    permissions: user.permissions || [],
  };

  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'enterprise-saas',
    audience: user.tenantId
  });
}

export function generateRefreshToken(user: Partial<User>): string {
  const payload = {
    userId: user._id!,
    tenantId: user.tenantId!,
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: 'enterprise-saas',
    audience: user.tenantId
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}