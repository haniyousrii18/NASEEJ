import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authProvider } from '../auth/authProvider.js';
import { authenticate } from '../middleware/auth.js';
import { logAuditEvent } from '../services/auditService.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Email and password are required.' },
    });
    return;
  }

  try {
    const userRes = await query(
      'SELECT id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, national_id, system_role, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (userRes.rowCount === 0) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Invalid email or password.' },
      });
      return;
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Account is deactivated. Contact platform administrator.' },
      });
      return;
    }

    const passwordValid = await authProvider.verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      logAuditEvent({
        actorEmail: email,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'auth',
        ipAddress: req.ip,
        details: { reason: 'Incorrect password' },
      });

      res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Invalid email or password.' },
      });
      return;
    }

    // Fetch memberships
    const memRes = await query(
      `SELECT m.*, o.name_ar as organization_name_ar, o.name_en as organization_name_en, o.code as organization_code 
       FROM organization_memberships m
       JOIN organizations o ON m.organization_id = o.id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [user.id]
    );

    // Fetch patient profile
    const patientRes = await query(
      'SELECT id FROM patient_profiles WHERE user_id = $1',
      [user.id]
    );

    // PATIENT-ONLY MODE: non-patient accounts are blocked at the API level.
    // To restore full access, revert commit on branch feat/patient-only-login.
    if (!patientRes.rowCount || patientRes.rowCount === 0) {
      res.status(403).json({
        success: false,
        error: {
          code: 'PATIENT_ONLY_MODE',
          message: 'This portal is currently available to patients only.',
        },
      });
      return;
    }

    const token = authProvider.generateToken({
      userId: user.id,
      email: user.email,
      systemRole: user.system_role,
    });

    logAuditEvent({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.system_role,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'auth',
      ipAddress: req.ip,
      details: { role: user.system_role, membershipsCount: memRes.rowCount },
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullNameAr: user.full_name_ar,
          fullNameEn: user.full_name_en,
          systemRole: user.system_role,
          patientProfileId: patientRes.rowCount && patientRes.rowCount > 0 ? patientRes.rows[0].id : null,
          memberships: memRes.rows,
        },
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Authentication service encountered an error.' },
    });
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user!.id,
        email: req.user!.email,
        fullNameAr: req.user!.full_name_ar,
        fullNameEn: req.user!.full_name_en,
        phone: req.user!.phone,
        nationalId: req.user!.national_id,
        systemRole: req.user!.system_role,
        patientProfileId: req.user!.patientProfileId || null,
        memberships: req.user!.memberships,
      },
    },
  });
});
