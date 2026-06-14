import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { getPineconeIndex } from '../config/pinecone.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
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
  const queryEmbedding = await generateEmbedding(query);
  const index = await getPineconeIndex();

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

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
