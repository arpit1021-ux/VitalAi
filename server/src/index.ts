import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import passport from 'passport';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { generalRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import scanRoutes from './routes/scans.js';
import chatRoutes from './routes/chat.js';
import pantryRoutes from './routes/pantry.js';
import insightRoutes from './routes/insights.js';
import dashboardRoutes from './routes/dashboard.js';
import dailyLogRoutes from './routes/dailyLog.js';

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(generalRateLimiter);
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/pantry', pantryRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dailylog', dailyLogRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start server
async function start() {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`VitalAI server running on port ${env.PORT}`);
  });
}

start().catch(console.error);

export default app;
