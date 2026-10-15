import { Request, Response, NextFunction } from 'express';
import { CenterRole } from '../types/index.js';
import { logAuditEvent } from '../services/auditService.js';
import { requireTenant } from './tenant.js';

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.system_role !== 'platform_admin') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_ROLE',
        message: 'This operation requires Platform Administrator privileges.',
      },
    });
    return;
  }
  next();
}

export function requireRole(allowedRoles: CenterRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const membership = req.currentMembership;
    if (!membership || !allowedRoles.includes(membership.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: `This operation requires one of the following roles: ${allowedRoles.join(', ')}.`,
        },
      });
      return;
    }
    next();
  };
}

export function blockPlatformAdminFromClinical(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.system_role === 'platform_admin') {
    logAuditEvent({
      organizationId: req.tenantId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: 'platform_admin',
      action: 'SECURITY_PLATFORM_ADMIN_CLINICAL_ACCESS_BLOCKED',
      resourceType: 'clinical_record',
      ipAddress: req.ip,
      details: {
        path: req.originalUrl,
        reason: 'PRD rule: Platform administrators have no routine access to clinical records.',
      },
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL',
        message: 'Platform administrators are structurally barred from accessing patient clinical records.',
      },
    });
    return;
  }
  next();
}

export function requirePatient(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.patientProfileId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'PATIENT_PROFILE_REQUIRED',
        message: 'This operation is reserved for registered patients.',
      },
    });
    return;
  }
  next();
}

/**
 * Clinical records (visits, prescriptions, lab orders and results) are readable only by the treating
 * clinicians of the active center and, for their own approved records, by the patient.
 * Reception, center managers, coordinators and caregivers are refused by the API itself, not just hidden in the UI.
 */
export function requireClinicalReader(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.patientProfileId) {
    next(); // handlers restrict a patient to their own APPROVED records
    return;
  }
  if (req.currentMembership?.role === 'doctor') {
    next();
    return;
  }

  logAuditEvent({
    organizationId: req.tenantId,
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    actorRole: req.currentMembership?.role || req.user?.system_role,
    action: 'SECURITY_CLINICAL_READ_BLOCKED',
    resourceType: 'clinical_record',
    ipAddress: req.ip,
    details: { path: req.originalUrl, method: req.method, reason: 'Role is not authorized to read clinical content.' },
  });

  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN_ROLE',
      message: 'Clinical records are limited to the treating clinicians and the patient.',
    },
  });
}

/** Patients act on their own record and need no center header; every other caller must pass tenant scoping. */
export function tenantUnlessPatient(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.patientProfileId) {
    next();
    return;
  }
  requireTenant(req, res, next);
}
