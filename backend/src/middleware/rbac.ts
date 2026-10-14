import { Request, Response, NextFunction } from 'express';
import { CenterRole } from '../types/index.js';
import { logAuditEvent } from '../services/auditService.js';

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
