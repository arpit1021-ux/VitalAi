import { generateText } from '../services/llm.js';
import { generateEmbedding, searchKnowledgeBase } from '../services/rag.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Minimal end-to-end check of the model and retrieval paths.
 *
 * Exists because a configuration mistake broke every generation call in the
 * application — the client was pinned to an API version that rejects
 * systemInstruction — and nothing caught it. The static checks verify
 * structure; only a real call verifies the call works.
 *
 * Deliberately tiny: a few hundred tokens, so it is cheap enough to run before
 * every deploy.
 *
 *   npm --prefix server run test:llm
 */

interface Check {
  name: string;
  run: () => Promise<string | null>;
}

const CHECKS: Check[] = [
  {
    // The exact failure that shipped: v1 rejects systemInstruction, so a
    // system prompt that is silently ignored looks identical to one that
    // works until you assert on it.
    name: 'system instructions are honoured',
    run: async () => {
      const response = await generateText({
        systemPrompt:
          'You are a test fixture. Regardless of what the user asks, reply with exactly the word ACKNOWLEDGED and nothing else.',
        userMessage: 'What is the capital of France?',
        operation: 'smoke.system_instruction',
        maxOutputTokens: 64,
      });

      if (!/ACKNOWLEDGED/i.test(response)) {
        return `system prompt was not applied; model replied ${JSON.stringify(response.slice(0, 120))}`;
      }
      return null;
    },
  },
  {
    name: 'untrusted blocks reach the model as data',
    run: async () => {
      const response = await generateText({
        systemPrompt:
          'Reply with the single word FOUND if the <marker> block contains the text ZEBRA42, otherwise reply MISSING.',
        userMessage: 'Check the marker block.',
        untrusted: [{ label: 'marker', content: 'ZEBRA42' }],
        operation: 'smoke.untrusted_block',
        maxOutputTokens: 64,
      });

      if (!/FOUND/i.test(response)) {
        return `delimited content did not reach the model; replied ${JSON.stringify(response.slice(0, 120))}`;
      }
      return null;
    },
  },
  {
    name: 'conversation history is sent as real turns',
    run: async () => {
      const response = await generateText({
        systemPrompt: 'Answer in one word.',
        userMessage: 'What number did I just say?',
        history: [
          { role: 'user', content: 'Remember the number 77.' },
          { role: 'assistant', content: 'Noted, 77.' },
        ],
        operation: 'smoke.history',
        maxOutputTokens: 64,
      });

      // Accepts digits or the written form: the model answers "77" or
      // "Seventy-seven" depending on phrasing, and both prove history arrived.
      if (!/\b77\b|seventy[\s-]?seven/i.test(response)) {
        return `history was not carried; replied ${JSON.stringify(response.slice(0, 120))}`;
      }
      return null;
    },
  },
  {
    name: 'embeddings return the configured dimensionality',
    run: async () => {
      const embedding = await generateEmbedding('peanut allergy');
      if (embedding.length !== env.PINECONE_DIMENSION) {
        return `expected ${env.PINECONE_DIMENSION} dimensions, got ${embedding.length}`;
      }
      return null;
    },
  },
  {
    name: 'knowledge base returns matches',
    run: async () => {
      const results = await searchKnowledgeBase('is sugar bad for diabetes');
      if (results.length === 0) {
        return 'retrieval returned nothing — has the ingest script been run against this index?';
      }
      return null;
    },
  },
];

async function main(): Promise<void> {
  process.stdout.write('\nModel and retrieval smoke test\n\n');

  let failed = 0;

  for (const check of CHECKS) {
    let problem: string | null;
    try {
      problem = await check.run();
    } catch (error) {
      problem = `threw: ${(error as Error).message}`;
    }

    if (problem) {
      failed += 1;
      process.stdout.write(`  FAIL  ${check.name}\n        ${problem}\n`);
    } else {
      process.stdout.write(`  PASS  ${check.name}\n`);
    }
  }

  process.stdout.write(`\n${CHECKS.length - failed} passed, ${failed} failed\n\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  logger.error('Smoke test could not run', error);
  process.exit(1);
});
