import { query } from '../config/db.js';

export interface AuditLogEntry {
  organizationId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, any>;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const text = `
      INSERT INTO audit_logs (
        organization_id, actor_id, actor_email, actor_role, action, resource_type, resource_id, ip_address, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    const params = [
      entry.organizationId || null,
      entry.actorId || null,
      entry.actorEmail || null,
      entry.actorRole || null,
      entry.action,
      entry.resourceType,
      entry.resourceId || null,
      entry.ipAddress || null,
      JSON.stringify(entry.details || {}),
    ];
    await query(text, params);
  } catch (err) {
    // Audit log failures must be recorded in system console without breaking the critical path
    console.error('[AUDIT LOG ERROR] Failed to record audit log:', err);
  }
}
