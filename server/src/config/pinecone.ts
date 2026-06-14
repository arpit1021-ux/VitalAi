import { Pinecone } from '@pinecone-database/pinecone';
import { env } from './env.js';

let pineconeClient: Pinecone | null = null;
let pineconeIndex: ReturnType<Pinecone['Index']> | null = null;

export async function getPineconeIndex() {
  if (pineconeIndex) return pineconeIndex;

  pineconeClient = new Pinecone({
    apiKey: env.PINECONE_API_KEY,
  });

  const indexName = env.PINECONE_INDEX_NAME;
  const existingIndexes = await pineconeClient.listIndexes();
  const indexExists = existingIndexes.indexes?.some((i) => i.name === indexName);

  if (!indexExists) {
    await pineconeClient.createIndex({
      name: indexName,
      dimension: 1536,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });
    console.log(`Created Pinecone index: ${indexName}`);
  }

  pineconeIndex = pineconeClient.index(indexName);
  return pineconeIndex;
}
