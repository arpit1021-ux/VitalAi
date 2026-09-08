import { env } from '../config/env.js';
import { store } from './store.js';
import { logger } from '../utils/logger.js';
import { tooManyRequests, serviceUnavailable } from '../utils/AppError.js';

/**
 * Token accounting, per-user budgets and a service-wide spend ceiling.
 *
 * Request counts are a poor proxy for cost: one image scan can cost more than
 * fifty chat turns. Budgets here are denominated in tokens, and the ceiling in
 * dollars, because those are the things that actually run out.
 */

const DAY_SECONDS = 24 * 60 * 60;

/** Keys roll over at UTC midnight; the TTL makes cleanup automatic. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function userKey(userId: string, kind: 'in' | 'out'): string {
  return `usage:v1:${today()}:user:${userId}:${kind}`;
}

const spendKey = (): string => `usage:v1:${today()}:spend_micros`;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function estimateCostUsd(usage: TokenUsage): number {
  return (
    (usage.inputTokens / 1_000_000) * env.PRICE_PER_MTOK_INPUT_USD +
    (usage.outputTokens / 1_000_000) * env.PRICE_PER_MTOK_OUTPUT_USD
  );
}

export interface BudgetStatus {
  inputUsed: number;
  outputUsed: number;
  inputLimit: number;
  outputLimit: number;
  spendUsd: number;
  spendCeilingUsd: number;
  resetsInSeconds: number;
}

export async function getBudgetStatus(userId: string): Promise<BudgetStatus> {
  const [inputUsed, outputUsed, spendMicros, ttl] = await Promise.all([
    store.get(userKey(userId, 'in')),
    store.get(userKey(userId, 'out')),
    store.get(spendKey()),
    store.ttl(userKey(userId, 'in')),
  ]);

  return {
    inputUsed: Number(inputUsed ?? 0),
    outputUsed: Number(outputUsed ?? 0),
    inputLimit: env.USER_DAILY_INPUT_TOKENS,
    outputLimit: env.USER_DAILY_OUTPUT_TOKENS,
    spendUsd: Number(spendMicros ?? 0) / 1_000_000,
    spendCeilingUsd: env.DAILY_SPEND_CEILING_USD,
    resetsInSeconds: ttl ?? DAY_SECONDS,
  };
}

function hoursUntilReset(seconds: number): string {
  const hours = Math.ceil(seconds / 3600);
  return hours <= 1 ? 'within the hour' : `in about ${hours} hours`;
}

/**
 * Checked before a model call, not after.
 *
 * A budget enforced only on the way out lets a single expensive request blow
 * straight through it. This refuses the request that would exceed the
 * allowance, which means the allowance can be exceeded by at most the cost of
 * one in-flight call.
 */
export async function assertWithinBudget(userId: string): Promise<void> {
  const status = await getBudgetStatus(userId);

  if (status.spendUsd >= status.spendCeilingUsd) {
    logger.error('Daily spend ceiling reached; AI routes are closed', undefined, {
      spendUsd: status.spendUsd,
      ceilingUsd: status.spendCeilingUsd,
    });

    throw serviceUnavailable(
      'AI features are paused for today.',
      'This is a spending safeguard on our side, not a problem with your account. Your saved scans and history are still available, and normal service resumes tomorrow.',
    );
  }

  if (status.inputUsed >= status.inputLimit || status.outputUsed >= status.outputLimit) {
    logger.warn('User daily token budget exhausted', {
      userId,
      inputUsed: status.inputUsed,
      outputUsed: status.outputUsed,
    });

    throw tooManyRequests(
      "You've used your AI allowance for today.",
      `It resets ${hoursUntilReset(status.resetsInSeconds)}. Your scans, chats and history are all still available in the meantime.`,
    );
  }
}

/**
 * Records what a completed call actually consumed.
 *
 * Spend is stored in integer micro-dollars because the counter is a Redis
 * INCRBY, which does not do floating point.
 */
export async function recordUsage(
  userId: string | undefined,
  usage: TokenUsage,
  context: { operation: string },
): Promise<void> {
  const costUsd = estimateCostUsd(usage);
  const costMicros = Math.round(costUsd * 1_000_000);

  const writes: Promise<unknown>[] = [store.increment(spendKey(), costMicros, DAY_SECONDS)];

  if (userId) {
    writes.push(
      store.increment(userKey(userId, 'in'), usage.inputTokens, DAY_SECONDS),
      store.increment(userKey(userId, 'out'), usage.outputTokens, DAY_SECONDS),
    );
  }

  try {
    await Promise.all(writes);
  } catch (error) {
    // Accounting must never fail a request the user already paid for. The gap
    // is logged so it can be reconciled against provider billing.
    logger.error('Failed to record token usage', error, { userId, ...context });
  }

  logger.info('Model call completed', {
    operation: context.operation,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: Number(costUsd.toFixed(6)),
  });
}
