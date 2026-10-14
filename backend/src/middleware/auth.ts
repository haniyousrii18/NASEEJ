import { Request, Response, NextFunction } from 'express';
import { authProvider } from '../auth/authProvider.js';
import { query } from '../config/db.js';
import { User, OrganizationMembership, SystemRole } from '../types/index.js';

export interface AuthenticatedUser extends User {
  memberships: (OrganizationMembership & { organization_name_ar: string; organization_name_en: string; organization_code: string })[];
  patientProfileId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantId?: string;
      currentMembership?: OrganizationMembership;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header with Bearer token.',
      },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = authProvider.verifyToken(token);
    
    // Fetch user from database
    const userRes = await query<User>(
      'SELECT id, auth_provider_id, email, full_name_ar, full_name_en, phone, national_id, system_role, is_active, created_at, updated_at FROM users WHERE id = $1',
      [payload.userId]
    );

    if (userRes.rowCount === 0 || !userRes.rows[0].is_active) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE_OR_NOT_FOUND',
          message: 'The user account does not exist or has been deactivated.',
        },
      });
      return;
    }

    const user = userRes.rows[0];

    // Fetch user organization memberships
    const memRes = await query(
      `SELECT m.*, o.name_ar as organization_name_ar, o.name_en as organization_name_en, o.code as organization_code 
       FROM organization_memberships m
       JOIN organizations o ON m.organization_id = o.id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [user.id]
    );

    // Check if user has an associated patient profile
    const patientRes = await query(
      'SELECT id FROM patient_profiles WHERE user_id = $1',
      [user.id]
    );

    const authenticatedUser: AuthenticatedUser = {
      ...user,
      memberships: memRes.rows as any,
      patientProfileId: patientRes.rowCount && patientRes.rowCount > 0 ? patientRes.rows[0].id : undefined,
    };

    req.user = authenticatedUser;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired session token.',
      },
    });
  }
}
