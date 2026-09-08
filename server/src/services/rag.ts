import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { getPineconeIndex } from '../config/pinecone.js';
import { logger } from '../utils/logger.js';

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY as string, apiVersion: 'v1' });

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: env.PINECONE_DIMENSION,
    },
  });
  return result.embeddings?.[0]?.values ?? [];
}

export interface RAGResult {
  score: number;
  text: string;
  metadata: {
    source: string;
    category: string;
    topic?: string;
    url?: string;
  };
}

export async function searchKnowledgeBase(
  query: string,
  topK = 5
): Promise<RAGResult[]> {
  const embedStart = Date.now();
  const queryEmbedding = await generateEmbedding(query);
  const embedMs = Date.now() - embedStart;

  const pineconeStart = Date.now();
  const index = await getPineconeIndex();
  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });
  const pineconeMs = Date.now() - pineconeStart;

  logger.debug('Retrieval timing', { embedMs, pineconeMs, totalMs: embedMs + pineconeMs, topK });

  return results.matches
    .filter((match) => match.score && match.score > 0.3)
    .map((match) => ({
      score: match.score || 0,
      text: match.metadata?.text as string || '',
      metadata: {
        source: (match.metadata?.source as string) || 'unknown',
        category: (match.metadata?.category as string) || 'general',
        topic: (match.metadata?.topic as string) || undefined,
        url: match.metadata?.url as string | undefined,
      },
    }));
}

/**
 * Upserts a passage under an id derived from its own content.
 *
 * A random id per call made re-running the ingest script duplicate the entire
 * corpus, which silently skews retrieval towards whichever passages had been
 * ingested most often. A content hash makes ingestion idempotent: re-running it
 * overwrites each passage in place.
 */
export async function embedAndStore(
  text: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const embedding = await generateEmbedding(text);
  const index = await getPineconeIndex();

  const id = createHash('sha256').update(text).digest('hex').slice(0, 32);

  await index.upsert([
    {
      id,
      values: embedding,
      metadata: { text, ...metadata },
    },
  ]);
}
