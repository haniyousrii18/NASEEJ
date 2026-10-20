import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authRouter } from './routes/authRoutes.js';
import { portalRouter } from './routes/portalRoutes.js';
import { documentRouter } from './routes/documentRoutes.js';
import { documentReviewRouter } from './routes/documentReviewRoutes.js';
import { accountRouter } from './routes/accountRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { recordRouter } from './routes/recordRoutes.js';
import { vaultRouter } from './routes/vaultRoutes.js';
import { prepRouter } from './routes/prepRoutes.js';
import { patientShareRouter, publicShareRouter } from './routes/shareRoutes.js';
import { assistantRouter } from './routes/assistantRoutes.js';
import { translateRouter } from './routes/translateRoutes.js';
import { ENV } from './config/env.js';

export const app: Express = express();

// Middlewares
// Behind a reverse proxy the client address comes from X-Forwarded-For; without one it must not be trusted (rate limits, share access hashes).
if (ENV.TRUST_PROXY > 0) app.set('trust proxy', ENV.TRUST_PROXY);
app.use(cors({ origin: true, credentials: true }));
// Uploads arrive as base64 JSON (about 4 MB of file), so only the documents route gets a larger body limit.
app.use('/api/documents', express.json({ limit: '6mb' }));
app.use('/api/vault', express.json({ limit: '6mb' }));
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
app.use('/api/account', accountRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/portal', portalRouter);
app.use('/api/documents', documentReviewRouter);
app.use('/api/documents', documentRouter);
app.use('/api/record', recordRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/prep', prepRouter);
app.use('/api/shares', patientShareRouter);
app.use('/api/share-view', publicShareRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/translate', translateRouter);
app.use('/api/translate', translateRouter);

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
  // Malformed JSON and oversized bodies are the client's error, not a server fault.
  const clientStatus = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : null;
  if (clientStatus) {
    res.status(clientStatus).json({
      success: false,
      error: {
        code: clientStatus === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: clientStatus === 413 ? 'The request body is too large.' : 'The request could not be processed.',
      },
    });
    return;
  }
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
