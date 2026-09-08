import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { getPineconeIndex } from './config/pinecone.js';
import { logger } from './utils/logger.js';
import { captureException, flushObservability, initObservability } from './services/observability.js';

async function start(): Promise<void> {
  await initObservability();
  await connectDB();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info('VitalAI server listening', {
      port: env.PORT,
      environment: env.NODE_ENV,
      llmProvider: env.LLM_PROVIDER,
    });
  });

  // Warm the vector index off the critical path so the first user request does
  // not pay for index resolution. Failure is non-fatal: retrieval degrades to
  // an ungrounded answer, which the RAG layer already handles.
  void getPineconeIndex()
    .then(() => logger.info('Pinecone index warm'))
    .catch((error) => logger.error('Pinecone warm-up failed; retrieval will retry per request', error));

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutdown signal received', { signal });

    const forced = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 15_000);
    forced.unref();

    server.close(async (error) => {
      if (error) logger.error('Error closing HTTP server', error);
      try {
        await flushObservability();
        await disconnectDB();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (closeError) {
        logger.error('Error closing database connection', closeError);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
    captureException(reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception; exiting', error);
    captureException(error);
    // Give the report a moment to send before the process goes away.
    void flushObservability(1500).finally(() => process.exit(1));
  });
}

start().catch((error) => {
  logger.error('Server failed to start', error);
  process.exit(1);
});

export { createApp };
