import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import passport from 'passport';

import { env, isProduction } from './config/env.js';
import { isDatabaseHealthy } from './config/db.js';
import { isPineconeWarm } from './config/pinecone.js';
import { requestContext } from './middleware/requestContext.js';
import { authenticate } from './middleware/auth.js';
import { enforceAiBudget } from './middleware/aiBudget.js';
import { generalRateLimiter, aiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { logger } from './utils/logger.js';
import { idempotency } from './middleware/idempotency.js';

import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import profileRoutes from './routes/profiles.js';
import scanRoutes from './routes/scans.js';
import chatRoutes from './routes/chat.js';
import pantryRoutes from './routes/pantry.js';
import insightRoutes from './routes/insights.js';
import dashboardRoutes from './routes/dashboard.js';
import dailyLogRoutes from './routes/dailyLog.js';
import healthScoreRoutes from './routes/healthScore.js';
import healthInsightsRoutes from './routes/healthInsights.js';
import savedRecipeRoutes from './routes/savedRecipes.js';
import communityRoutes from './routes/community.js';

/**
 * Builds the application without starting anything.
 *
 * Kept separate from index.ts so tests can mount the real middleware stack —
 * the same CORS rules, the same validation, the same error handler — against
 * an ephemeral port, rather than testing a reconstruction of it.
 */
export function createApp() {
    const app = express();

  // Rate limiting and `secure` cookies both depend on the real client IP and
  // protocol, which only arrive as X-Forwarded-* headers behind a platform proxy.
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(requestContext);

  app.use(
    helmet({
      contentSecurityPolicy: false, // The API serves JSON only; the SPA host owns its own CSP.
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  );

  const allowedOrigins = new Set(env.CORS_ORIGINS);

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server requests arrive without an Origin header.
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        logger.warn('Blocked cross-origin request', { origin });
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-Id', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
      maxAge: 86_400,
    }),
  );

  app.use(cookieParser());

  // 10 MB is only needed by the multipart scan routes, which multer handles
  // separately. JSON bodies are capped far lower so a malformed client cannot
  // pin a worker parsing megabytes of text.
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use(generalRateLimiter);
  app.use(passport.initialize());

  // Liveness: is the process up and able to answer? Used by the platform to
  // decide whether to restart the container.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness: can this instance actually serve traffic? Used to decide whether
  // to route requests here. A degraded dependency fails the check.
  app.get('/health/ready', (_req, res) => {
    const database = isDatabaseHealthy();
    const vectorStore = isPineconeWarm();
    const ready = database;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded',
      checks: { database, vectorStore },
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/profiles', profileRoutes);
  app.use('/api/scans', authenticate, aiRateLimiter, enforceAiBudget, idempotency, scanRoutes);
  app.use('/api/chat', authenticate, aiRateLimiter, enforceAiBudget, idempotency, chatRoutes);
  app.use('/api/pantry', authenticate, enforceAiBudget, idempotency, pantryRoutes);
  app.use('/api/insights', authenticate, aiRateLimiter, enforceAiBudget, idempotency, insightRoutes);
  app.use('/api/dashboard', authenticate, aiRateLimiter, enforceAiBudget, idempotency, dashboardRoutes);
  app.use('/api/dailylog', dailyLogRoutes);
  app.use('/api/health-score', healthScoreRoutes);
  app.use('/api/health-insights', authenticate, aiRateLimiter, enforceAiBudget, idempotency, healthInsightsRoutes);
  app.use('/api/saved-recipes', savedRecipeRoutes);
  app.use('/api/community', authenticate, aiRateLimiter, enforceAiBudget, idempotency, communityRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
