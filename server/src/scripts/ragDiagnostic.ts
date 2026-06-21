import dotenv from 'dotenv';
dotenv.config();

import { searchKnowledgeBase } from '../services/rag.js';

async function runDiagnostic() {
  const queries = [
    { q: 'is MSG safe to eat', expect: 'additives' },
    { q: 'how much sodium with kidney disease', expect: 'kidney-disease' },
    { q: 'foods to avoid with diabetes', expect: 'diabetes' },
    { q: 'fatty liver diet recommendations', expect: 'fatty-liver' },
    { q: 'gluten allergy hidden sources', expect: 'allergens' },
    { q: 'statin drug interactions grapefruit', expect: 'drug-interactions' },
  ];

  for (const { q, expect: expectedTopic } of queries) {
    console.log(`\nQuery: "${q}" (expect topic: ${expectedTopic})`);
    const results = await searchKnowledgeBase(q, 5);
    for (const r of results) {
      const match = r.metadata.topic === expectedTopic ? '✓' : '✗';
      console.log(`  ${match} [${r.score.toFixed(3)}] ${r.metadata.source} / ${r.metadata.topic || '?'} — ${r.text.slice(0, 80)}...`);
    }
    const relevantCount = results.filter((r) => r.metadata.topic === expectedTopic).length;
    console.log(`  → ${relevantCount}/${results.length} topically relevant`);
  }
}

runDiagnostic().catch(console.error);
