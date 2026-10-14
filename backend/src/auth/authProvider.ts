import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { AuthTokenPayload, SystemRole } from '../types/index.js';

export interface IAuthProvider {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(payload: AuthTokenPayload): string;
  verifyToken(token: string): AuthTokenPayload;
}

export class LocalAuthProvider implements IAuthProvider {
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    // In demo environment, handle both standard bcrypt format and seeded hash
    try {
      return await bcrypt.compare(password, hash);
    } catch (e) {
      // Fallback if hash format variance
      return false;
    }
  }

  generateToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRES_IN as any,
    });
  }

  verifyToken(token: string): AuthTokenPayload {
    return jwt.verify(token, ENV.JWT_SECRET) as AuthTokenPayload;
  }
}

// Default exported singleton provider
export const authProvider: IAuthProvider = new LocalAuthProvider();
