import { env } from '../config/env.js';
import { store } from './store.js';
import { getRequestContext } from '../middleware/requestContext.js';
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
 * What a request is charged before it runs.
 *
 * A budget verified by reading a counter and then acting on it is racy: two
 * requests can both read a figure under the limit before either records
 * anything, and both proceed. Charging first and refunding the difference
 * afterwards makes the decision atomic, at the cost of briefly over-counting a
 * request that turns out to be cheap.
 *
 * The figures are a deliberate over-estimate of a typical call, so the charge
 * is nearly always refunded downwards rather than upwards.
 */
const RESERVE_INPUT_TOKENS = 4000;
const RESERVE_OUTPUT_TOKENS = 1500;

/**
 * Charges the caller for a model call about to be made, and refuses the
 * request if that charge would take them past their allowance.
 *
 * The service-wide ceiling above it is read rather than reserved: it is a
 * kill-switch measured in dollars across every user, so being one in-flight
 * request late to trip is immaterial, and reserving against it would need a
 * cost estimate the caller does not have yet.
 */
export async function reserveBudget(userId: string): Promise<void> {
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

  const [inputUsed, outputUsed] = await Promise.all([
    store.increment(userKey(userId, 'in'), RESERVE_INPUT_TOKENS, DAY_SECONDS),
    store.increment(userKey(userId, 'out'), RESERVE_OUTPUT_TOKENS, DAY_SECONDS),
  ]);

  if (inputUsed > status.inputLimit || outputUsed > status.outputLimit) {
    // Over the line, so the charge is given back before refusing: a rejected
    // request must not consume allowance.
    await refund({ inputTokens: RESERVE_INPUT_TOKENS, outputTokens: RESERVE_OUTPUT_TOKENS }, userId);

    logger.warn('User daily token budget exhausted', {
      userId,
      inputUsed,
      outputUsed,
    });

    throw tooManyRequests(
      "You've used your AI allowance for today.",
      `It resets ${hoursUntilReset(status.resetsInSeconds)}. Your scans, chats and history are all still available in the meantime.`,
    );
  }

  const context = getRequestContext();
  if (context) {
    context.aiReservation = {
      inputTokens: RESERVE_INPUT_TOKENS,
      outputTokens: RESERVE_OUTPUT_TOKENS,
    };
  }
}

async function refund(
  reservation: { inputTokens: number; outputTokens: number },
  userId: string,
): Promise<void> {
  try {
    await Promise.all([
      store.increment(userKey(userId, 'in'), -reservation.inputTokens, DAY_SECONDS),
      store.increment(userKey(userId, 'out'), -reservation.outputTokens, DAY_SECONDS),
    ]);
  } catch (error) {
    // An unrefunded reservation makes the day's allowance smaller than it
    // should be, which is the safe direction to fail in. It is logged because
    // it is still wrong.
    logger.error('Failed to refund an AI budget reservation', error, { userId });
  }
}

/**
 * Releases a charge taken for a request that never reached a model.
 *
 * Mounted on the response, so a handler that throws after the budget
 * middleware — a validation failure, a missing profile — does not leave the
 * caller paying for work that never happened.
 */
export async function releaseUnusedBudget(userId: string): Promise<void> {
  const context = getRequestContext();
  const reservation = context?.aiReservation;
  if (!context || !reservation) return;

  context.aiReservation = undefined;
  await refund(reservation, userId);
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
    // The reservation taken before the call is already on the counters, so
    // what gets written here is the difference — usually negative, because the
    // reservation deliberately over-estimates. A second model call in the same
    // request finds no reservation left and is charged in full.
    const context = getRequestContext();
    const reservation = context?.aiReservation;
    if (context) context.aiReservation = undefined;

    const inputDelta = usage.inputTokens - (reservation?.inputTokens ?? 0);
    const outputDelta = usage.outputTokens - (reservation?.outputTokens ?? 0);

    if (inputDelta !== 0) writes.push(store.increment(userKey(userId, 'in'), inputDelta, DAY_SECONDS));
    if (outputDelta !== 0) writes.push(store.increment(userKey(userId, 'out'), outputDelta, DAY_SECONDS));
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
