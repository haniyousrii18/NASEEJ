import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';

export const publicRouter = Router();

// POST /api/public/demo-requests
publicRouter.post('/demo-requests', async (req: Request, res: Response): Promise<void> => {
  const { organization_name, contact_name, email, phone, center_type, notes } = req.body;

  if (!organization_name || !contact_name || !email || !phone) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'organization_name, contact_name, email, and phone are required.' },
    });
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO demo_requests (organization_name, contact_name, email, phone, center_type, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'new')
       RETURNING *`,
      [organization_name, contact_name, email.trim().toLowerCase(), phone, center_type || 'clinic', notes || null]
    );

    logAuditEvent({
      actorEmail: email,
      action: 'PUBLIC_DEMO_REQUEST_SUBMIT',
      resourceType: 'demo_request',
      resourceId: insertRes.rows[0].id,
      ipAddress: req.ip,
      details: { organizationName: organization_name, contactName: contact_name },
    });

    res.status(201).json({
      success: true,
      data: {
        id: insertRes.rows[0].id,
        message: 'Thank you for your interest in Naseej. Our onboarding team will contact you shortly.',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/public/contact
publicRouter.post('/contact', async (req: Request, res: Response): Promise<void> => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Name, email, and message are required.' },
    });
    return;
  }

  logAuditEvent({
    actorEmail: email,
    action: 'PUBLIC_CONTACT_INQUIRY',
    resourceType: 'contact',
    ipAddress: req.ip,
    details: { name, subject },
  });

  res.json({
    success: true,
    data: { message: 'Inquiry received successfully. Naseej support will follow up with you.' },
  });
});

// GET /api/public/demo-requests (Platform Admin view). The list holds contact names, emails and phone numbers,
// so unlike the POST above it is closed to everyone but platform administrators.
publicRouter.get('/demo-requests', authenticate, requirePlatformAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const requestsRes = await query('SELECT * FROM demo_requests ORDER BY created_at DESC');
    res.json({ success: true, data: requestsRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
