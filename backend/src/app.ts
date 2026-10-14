import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authRouter } from './routes/authRoutes.js';
import { organizationRouter } from './routes/organizationRoutes.js';
import { patientRouter } from './routes/patientRoutes.js';
import { appointmentRouter } from './routes/appointmentRoutes.js';
import { visitRouter } from './routes/visitRoutes.js';
import { prescriptionRouter } from './routes/prescriptionRoutes.js';
import { labRouter } from './routes/labRoutes.js';
import { portalRouter } from './routes/portalRoutes.js';
import { auditRouter } from './routes/auditRoutes.js';
import { publicRouter } from './routes/publicRoutes.js';

export const app: Express = express();

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    product: 'Naseej | نَسيج',
    timestamp: new Date().toISOString(),
    version: '1.0.0-academic',
  });
});

// Mount Routes
app.use('/api/auth', authRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/patients', patientRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/visits', visitRouter);
app.use('/api/prescriptions', prescriptionRouter);
app.use('/api/labs', labRouter);
app.use('/api/portal', portalRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/public', publicRouter);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`,
    },
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
  });
});
