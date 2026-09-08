import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let connecting: Promise<typeof mongoose> | null = null;
let shuttingDown = false;

/**
 * Connects with an explicit pool. Mongoose buffers commands by default, which
 * turns a dead database into requests that hang until the client times out;
 * `bufferCommands: false` makes them fail fast so the error handler can return
 * a real message instead.
 */
export async function connectDB(uri: string = env.MONGODB_URI): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (!connecting) {
    connecting = mongoose.connect(uri, {
      maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
      minPoolSize: env.MONGODB_MIN_POOL_SIZE,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      bufferCommands: false,
      autoIndex: env.NODE_ENV !== 'production',
    });
  }

  try {
    await connecting;
    logger.info('MongoDB connected', {
      maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
      autoIndex: env.NODE_ENV !== 'production',
    });
  } catch (error) {
    connecting = null;
    logger.error('MongoDB connection failed', error);
    throw error;
  }

  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error', error);
  });

  mongoose.connection.on('disconnected', () => {
    // An intentional close also fires this event; only an unexpected drop is
    // worth a warning.
    if (!shuttingDown) logger.warn('MongoDB disconnected; driver will retry');
  });
}

export async function disconnectDB(): Promise<void> {
  shuttingDown = true;
  connecting = null;
  await mongoose.connection.close(false);
}

export function isDatabaseHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}
