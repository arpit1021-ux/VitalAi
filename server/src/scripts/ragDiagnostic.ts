import dotenv from 'dotenv';
dotenv.config();

import { searchKnowledgeBase } from '../services/rag.js';

async function runDiagnostic() {
  const queries = [
    'food ingredients safety Maggi noodles MSG',
    'drug interactions metformin diabetes',
    'vitamin supplements calcium iron',
  ];

  for (let i = 0; i < 3; i++) {
    console.log(`\n--- Run ${i + 1} ---`);
    for (const query of queries) {
      console.log(`\nQuery: "${query.slice(0, 50)}..."`);
      const start = Date.now();
      try {
        const results = await searchKnowledgeBase(query);
        const elapsed = Date.now() - start;
        console.log(`  Completed in ${elapsed}ms — ${results.length} results`);
        if (results.length > 0) {
          console.log(`  Top result: score=${results[0].score.toFixed(3)}, source=${results[0].metadata.source}`);
        }
      } catch (err: any) {
        const elapsed = Date.now() - start;
        console.error(`  FAILED after ${elapsed}ms: ${err.message}`);
      }
    }
  }
}

runDiagnostic().catch(console.error);
