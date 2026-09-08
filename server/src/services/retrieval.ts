import { searchKnowledgeBase } from './rag.js';
import { logger } from '../utils/logger.js';

export interface RetrievedContext {
  /** Passages formatted for prompt injection, empty when retrieval failed. */
  context: string;
  sources: string[];
  ragSources: { source: string; topic?: string }[];
  /** False when retrieval timed out or errored, so callers can flag confidence. */
  grounded: boolean;
}

const EMPTY: RetrievedContext = { context: '', sources: [], ragSources: [], grounded: false };
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Retrieval is an enhancement, not a dependency: a slow or failing vector store
 * degrades the answer to an ungrounded one rather than failing the request.
 * Callers receive `grounded: false` so they can lower stated confidence.
 */
export async function getRagContext(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RetrievedContext> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Retrieval exceeded ${timeoutMs}ms`)), timeoutMs);
    });

    const results = await Promise.race([searchKnowledgeBase(query), timeout]);

    logger.debug('Retrieval succeeded', { durationMs: Date.now() - startedAt, matches: results.length });

    return {
      context: results.map((r) => `[Source: ${r.metadata.source}] ${r.text}`).join('\n\n'),
      sources: results.map((r) => r.metadata.source),
      ragSources: results.map((r) => ({ source: r.metadata.source, topic: r.metadata.topic })),
      grounded: results.length > 0,
    };
  } catch (error) {
    logger.warn('Retrieval failed; continuing without grounding', {
      durationMs: Date.now() - startedAt,
      reason: (error as Error).message,
    });
    return EMPTY;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
