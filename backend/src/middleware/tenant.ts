import { Request, Response, NextFunction } from 'express';
import { logAuditEvent } from '../services/auditService.js';

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
    return;
  }

  // Extract tenant ID from header or query or route param
  const requestedOrgId = (req.headers['x-organization-id'] as string) || (req.params.orgId as string) || (req.query.organizationId as string);

  if (!requestedOrgId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_TENANT_ID',
        message: 'Medical Center ID (X-Organization-Id header) is required for this operation.',
      },
    });
    return;
  }

  // Check if user is a platform administrator
  if (user.system_role === 'platform_admin') {
    // Platform administrators can manage tenants, but clinical routes will have a separate check blocking them
    req.tenantId = requestedOrgId;
    next();
    return;
  }

  // Verify membership in requested organization for staff
  const membership = user.memberships.find((m) => m.organization_id === requestedOrgId);

  if (membership) {
    if (membership.organization_status === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'ORGANIZATION_SUSPENDED', message: 'This medical center is suspended. Contact the platform administrator.' },
      });
      return;
    }
    req.tenantId = requestedOrgId;
    req.currentMembership = membership;
    next();
    return;
  }

  // If user is a patient, check if they have an active center link in this organization
  if (user.patientProfileId) {
    import('../config/db.js').then(async ({ query }) => {
      try {
        const linkRes = await query(
          `SELECT l.*, o.status AS organization_status
           FROM patient_center_links l JOIN organizations o ON o.id = l.organization_id
           WHERE l.organization_id = $1 AND l.patient_id = $2 AND l.status = $3`,
          [requestedOrgId, user.patientProfileId, 'active']
        );
        if (linkRes.rowCount && linkRes.rowCount > 0) {
          if (linkRes.rows[0].organization_status === 'suspended') {
            res.status(403).json({
              success: false,
              error: { code: 'ORGANIZATION_SUSPENDED', message: 'This medical center is suspended.' },
            });
            return;
          }
          req.tenantId = requestedOrgId;
          next();
          return;
        }

        // Patient has no link to this center
        logAuditEvent({
          organizationId: requestedOrgId,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'patient',
          action: 'SECURITY_CROSS_TENANT_PATIENT_VIOLATION_BLOCKED',
          resourceType: 'organization',
          resourceId: requestedOrgId,
          ipAddress: req.ip,
          details: { path: req.originalUrl, method: req.method },
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN_CROSS_TENANT',
            message: 'Access denied: You are not registered at this medical center.',
          },
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
      }
    });
    return;
  }

  // Log unauthorized cross-tenant attempt for staff
  logAuditEvent({
    organizationId: requestedOrgId,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.system_role,
    action: 'SECURITY_CROSS_TENANT_VIOLATION_BLOCKED',
    resourceType: 'organization',
    resourceId: requestedOrgId,
    ipAddress: req.ip,
    details: {
      path: req.originalUrl,
      method: req.method,
      reason: 'User has no active membership or link in target organization.',
    },
  });

  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN_CROSS_TENANT',
      message: 'Access denied: You do not have an active membership in this medical center.',
    },
  });
}
