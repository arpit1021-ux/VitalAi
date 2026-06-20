import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../config/env.js';

async function checkIndex() {
  console.log('Checking Pinecone index status...\n');
  console.log(`Index name: ${env.PINECONE_INDEX_NAME}`);
  console.log(`API key configured: ${env.PINECONE_API_KEY ? 'Yes' : 'NO - MISSING'}`);
  console.log(`Gemini key configured: ${env.GEMINI_API_KEY ? 'Yes' : 'NO - MISSING'}\n`);

  if (!env.PINECONE_API_KEY) {
    console.error('ERROR: PINECONE_API_KEY is not set. Cannot check index.');
    process.exit(1);
  }

  const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  const indexList = await pinecone.listIndexes();

  console.log('Available indexes:', indexList.indexes?.map(i => i.name) || '(none)');

  const targetIndex = indexList.indexes?.find(i => i.name === env.PINECONE_INDEX_NAME);
  if (!targetIndex) {
    console.error(`\nERROR: Index "${env.PINECONE_INDEX_NAME}" not found in this Pinecone project.`);
    console.error('Make sure PINECONE_API_KEY and PINECONE_INDEX_NAME match the project where ingest was run.');
    process.exit(1);
  }

  console.log(`\nIndex "${env.PINECONE_INDEX_NAME}" found (dimension: ${targetIndex.dimension}, metric: ${targetIndex.metric})`);

  const index = pinecone.index(env.PINECONE_INDEX_NAME);
  const stats = await index.describeIndexStats();

  const totalVectors = stats.totalRecordCount ?? 0;
  console.log(`\nTotal vectors: ${totalVectors}`);

  if (stats.namespaces) {
    console.log('Namespaces:');
    for (const [ns, info] of Object.entries(stats.namespaces)) {
      console.log(`  ${ns || '(default)'}: ${info.recordCount} vectors`);
    }
  }

  if (totalVectors === 0) {
    console.log('\n⚠️  Index is EMPTY. You need to run "npm run ingest" to populate it.');
  } else if (totalVectors < 10) {
    console.log(`\n⚠️  Index has very few vectors (${totalVectors}). Expected ~20 from ingest script.`);
  } else {
    console.log(`\n✅ Index is populated with ${totalVectors} vectors.`);
  }
}

checkIndex().catch((err) => {
  console.error('Failed to check Pinecone index:', err.message || err);
  process.exit(1);
});
