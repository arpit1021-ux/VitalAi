import { Pinecone, type Index } from '@pinecone-database/pinecone';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let client: Pinecone | null = null;
let index: Index | null = null;
let pending: Promise<Index> | null = null;

/**
 * Resolves the index once and caches it. `listIndexes` is a network round-trip,
 * so it must not run per request; concurrent callers during startup share a
 * single in-flight promise rather than racing to create the index.
 */
export async function getPineconeIndex(): Promise<Index> {
  if (index) return index;
  if (pending) return pending;

  pending = (async () => {
    client ??= new Pinecone({ apiKey: env.PINECONE_API_KEY });

    const existing = await client.listIndexes();
    const exists = existing.indexes?.some((entry) => entry.name === env.PINECONE_INDEX_NAME);

    if (!exists) {
      if (env.NODE_ENV === 'production') {
        // Creating an index implicitly in production hides a misconfigured
        // PINECONE_INDEX_NAME behind an empty knowledge base.
        throw new Error(
          `Pinecone index "${env.PINECONE_INDEX_NAME}" does not exist. Create it before deploying.`,
        );
      }

      logger.warn('Creating Pinecone index', { name: env.PINECONE_INDEX_NAME });
      await client.createIndex({
        name: env.PINECONE_INDEX_NAME,
        dimension: env.PINECONE_DIMENSION,
        metric: 'cosine',
        spec: { serverless: { cloud: env.PINECONE_CLOUD, region: env.PINECONE_REGION } },
      });
    }

    index = client.index(env.PINECONE_INDEX_NAME);
    return index;
  })();

  try {
    return await pending;
  } catch (error) {
    pending = null;
    throw error;
  } finally {
    if (index) pending = null;
  }
}

export function isPineconeWarm(): boolean {
  return index !== null;
}
