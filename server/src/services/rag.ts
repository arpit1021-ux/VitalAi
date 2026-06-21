import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { getPineconeIndex } from '../config/pinecone.js';

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: 'v1' });

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: {
      outputDimensionality: 1536,
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

  console.log(`[RAG] Embedding: ${embedMs}ms | Pinecone: ${pineconeMs}ms | Total: ${embedMs + pineconeMs}ms`);

  return results.matches
    .filter((match) => match.score && match.score > 0.3)
    .map((match) => ({
      score: match.score || 0,
      text: match.metadata?.text as string || '',
      metadata: {
        source: (match.metadata?.source as string) || 'unknown',
        category: (match.metadata?.category as string) || 'general',
        url: match.metadata?.url as string | undefined,
      },
    }));
}

export async function embedAndStore(
  text: string,
  metadata: Record<string, any>
): Promise<void> {
  const embedding = await generateEmbedding(text);
  const index = await getPineconeIndex();

  await index.upsert([
    {
      id: uuidv4(),
      values: embedding,
      metadata: {
        text,
        ...metadata,
      },
    },
  ]);
}
