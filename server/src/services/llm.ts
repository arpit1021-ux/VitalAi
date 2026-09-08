import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { serviceUnavailable, tooManyRequests } from '../utils/AppError.js';
import { UNTRUSTED_CONTENT_RULE, wrapUntrusted } from './promptSafety.js';
import { recordUsage, type TokenUsage } from './usage.js';

/**
 * Provider-agnostic gateway for every model call in the application.
 *
 * All generation flows through here so retries, timeouts, output caps, caching
 * and error translation are defined once rather than per route.
 */

const DISCLAIMER = `You are VitalAI, an educational health information assistant. You provide evidence-based, general health information only. You never diagnose conditions, prescribe treatments, or claim medical certainty. Always recommend consulting a licensed professional for personal medical decisions. Frame all responses as "research suggests," "studies indicate," "generally recommended" — never as definitive medical advice.`;

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;

let geminiClient: GoogleGenAI | null = null;
let anthropicClient: Anthropic | null = null;

// Clients are created on first use rather than at module load, so an unused
// provider never allocates a connection pool or validates a key it will not need.
function gemini(): GoogleGenAI {
  // No apiVersion pin. The v1 endpoint rejects systemInstruction outright
  // ("Developer instruction is not enabled for api version v1"), which breaks
  // every generation call in the application. The embedding client in rag.ts
  // pins v1 separately because outputDimensionality is served there.
  geminiClient ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY as string });
  return geminiClient;
}

function anthropic(): Anthropic {
  anthropicClient ??= new Anthropic({ apiKey: env.CLAUDE_API_KEY as string });
  return anthropicClient;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateParams {
  /**
   * Instructions to the model. Must never contain user-supplied text: anything
   * placed here is read as instruction, which is exactly what an injection
   * needs. Untrusted values belong in `untrusted` or `history`.
   */
  systemPrompt: string;
  /** The user's message for this turn. Sent as data, inside delimiters. */
  userMessage: string;
  /** Retrieved knowledge-base passages. Delimited before being sent. */
  context?: string;
  /**
   * Named blocks of untrusted content — OCR text, pantry names, post bodies.
   * Each is wrapped in its own tag so the model can be told what it is.
   */
  untrusted?: { label: string; content: string }[];
  /**
   * Prior turns, sent as real conversation turns rather than transcribed into
   * the system prompt. Embedding history as prompt text lets any past user
   * message act as an instruction.
   */
  history?: ConversationTurn[];
  maxOutputTokens?: number;
  /**
   * Internal reasoning budget, in tokens.
   *
   * Gemini 2.5 Flash is a thinking model: reasoning tokens are drawn from the
   * SAME allowance as the reply. At a low maxOutputTokens the model can spend
   * the entire budget thinking and return an empty string — which is what
   * happened when the cap was lowered for cost control.
   *
   * Zero by default. Every call in this application asks for structured output
   * against an explicit schema, where extended reasoning buys little and costs
   * output tokens at 8x the input rate. Raise it per call if a task genuinely
   * needs deliberation.
   */
  thinkingBudget?: number;
  /** Attributes token spend to a user. Omitted for system-initiated calls. */
  userId?: string;
  /** Names the call in usage logs. */
  operation: string;
}

export interface GenerateWithImageParams extends GenerateParams {
  imageBuffer: Buffer;
  mimeType: string;
  /**
   * Namespace for the vision cache. Must identify the requesting profile so a
   * cached analysis can never be served across accounts.
   */
  cacheScope: string;
}

/**
 * Assembles the system instruction and the current user turn.
 *
 * The system instruction carries only the disclaimer, the caller's static
 * instructions, and the standing rule about delimited content. Everything the
 * user or a photograph supplied goes into the user turn, tagged.
 */
function buildPrompt(params: GenerateParams): { system: string; user: string } {
  const system = [DISCLAIMER, params.systemPrompt, UNTRUSTED_CONTENT_RULE].join('\n\n');

  const sections: string[] = [];

  if (params.context) {
    sections.push(wrapUntrusted('reference_material', params.context));
  }

  for (const block of params.untrusted ?? []) {
    sections.push(wrapUntrusted(block.label, block.content));
  }

  sections.push(params.userMessage);

  return { system, user: sections.join('\n\n') };
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { status?: unknown; code?: unknown; httpStatusCode?: unknown };
  for (const value of [candidate.status, candidate.httpStatusCode, candidate.code]) {
    if (typeof value === 'number') return value;
  }
  return undefined;
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error);

  // A daily quota will not free up within this request.
  if (isDailyQuotaExhausted(error)) return false;

  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extracts the wait the provider asked for.
 *
 * A 429 from Gemini carries the exact delay before the quota frees up. Backing
 * off for 500ms when the server said 5.9 seconds burns two retries and still
 * fails, which is what the injection suite ran into.
 */
/**
 * The longest a retry may sleep inside a live request.
 *
 * Honouring the provider's delay is right for a short per-minute cooldown and
 * wrong for anything longer: the request already has a 45s timeout, and a user
 * waiting on a scan will not sit through a minute of silence. Past this, fail
 * fast and let them retry deliberately.
 */
const MAX_RETRY_DELAY_MS = 8000;

/**
 * True when the quota that was exhausted resets daily rather than per minute.
 *
 * A daily quota cannot clear during a request. Retrying it burns wall clock
 * for an outcome that is already decided, so these fail immediately.
 */
function isDailyQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /PerDay|RequestsPerDay/i.test(message);
}

function providerRetryDelayMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);

  const structured = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (structured) return Math.ceil(Number(structured[1]) * 1000);

  const prose = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (prose) return Math.ceil(Number(prose[1]) * 1000);

  return null;
}

/**
 * Translates a provider failure into a message the user can act on. The raw
 * error is logged with the request's correlation ID and never returned.
 */
function toUserFacingError(error: unknown, attempts: number): Error {
  const status = statusOf(error);

  if (status === 429) {
    if (isDailyQuotaExhausted(error)) {
      return serviceUnavailable(
        "AI features have reached today's usage limit.",
        'This is a limit on our side, not your account. Your scans, chats and history are all still available, and normal service resumes tomorrow.',
        error,
      );
    }

    const cooldown = providerRetryDelayMs(error);
    return tooManyRequests(
      'The AI service is busy right now.',
      cooldown
        ? `Try again in about ${Math.ceil(cooldown / 1000)} seconds. Your data is saved.`
        : 'Wait about a minute and try again. Your data is saved.',
    );
  }

  if (status === 400) {
    return serviceUnavailable(
      'The AI service could not process that input.',
      'Try rephrasing your question, or use a clearer photo if you were scanning.',
      error,
    );
  }

  return serviceUnavailable(
    'The AI service is temporarily unavailable.',
    attempts > 1
      ? `We retried ${attempts} times without success. Try again in a few minutes.`
      : 'Try again in a few minutes.',
    error,
  );
}

async function withRetry<T>(operation: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  let lastError: unknown;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptsMade = attempt;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fn(controller.signal);
    } catch (error) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS || !isRetryable(error)) break;

      // Prefer the delay the provider asked for; fall back to exponential
      // backoff with jitter so a blip does not become a synchronised retry
      // storm from every worker at once.
      const requested = providerRetryDelayMs(error);

      // A cooldown longer than the cap means waiting it out inside the request
      // is worse than failing: the caller's own timeout would fire first.
      if (requested !== null && requested > MAX_RETRY_DELAY_MS) {
        logger.warn('Provider cooldown exceeds the retry cap; failing fast', {
          operation,
          requestedMs: requested,
          capMs: MAX_RETRY_DELAY_MS,
        });
        break;
      }

      const backoff = 500 * 2 ** (attempt - 1);
      const delay = requested ?? backoff + Math.floor(Math.random() * 250);
      logger.warn('LLM call failed; retrying', {
        operation,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        delayMs: delay,
        delaySource: requested === null ? 'backoff' : 'provider',
        status: statusOf(error),
      });
      await sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }

  logger.error('LLM call failed', lastError, {
    operation,
    attempts: attemptsMade,
    retryable: isRetryable(lastError),
  });
  throw toUserFacingError(lastError, attemptsMade);
}

/** Estimates tokens when the provider does not report them. ~4 characters per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function usageFrom(
  metadata: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined,
  fallback: { prompt: string; completion: string },
): TokenUsage {
  return {
    inputTokens: metadata?.promptTokenCount ?? estimateTokens(fallback.prompt),
    outputTokens: metadata?.candidatesTokenCount ?? estimateTokens(fallback.completion),
  };
}

async function generateWithGemini(params: GenerateParams): Promise<string> {
  const { system, user } = buildPrompt(params);

  // Prior turns are sent as real turns. Transcribing them into the prompt
  // would let any earlier user message read as an instruction.
  const contents = [
    ...(params.history ?? []).map((turn) => ({
      role: turn.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: turn.content }],
    })),
    { role: 'user' as const, parts: [{ text: user }] },
  ];

  const result = await withRetry('gemini.generateContent', (signal) =>
    gemini().models.generateContent({
      model: env.GEMINI_TEXT_MODEL,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: params.thinkingBudget ?? 0 },
        abortSignal: signal,
      },
    }),
  );

  const text = result.text ?? '';

  if (!text) {
    // An empty completion is not a valid answer. It usually means the output
    // allowance was consumed before any text was produced.
    logger.warn('Model returned an empty completion', {
      operation: params.operation,
      maxOutputTokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      finishReason: result.candidates?.[0]?.finishReason,
    });
  }

  await recordUsage(
    params.userId,
    usageFrom(result.usageMetadata, { prompt: system + user, completion: text }),
    { operation: params.operation },
  );

  return text;
}

async function generateWithClaude(params: GenerateParams): Promise<string> {
  const { system, user } = buildPrompt(params);

  const response = await withRetry('anthropic.messages.create', (signal) =>
    anthropic().messages.create(
      {
        model: env.CLAUDE_TEXT_MODEL,
        max_tokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        system,
        messages: [
          ...(params.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
          { role: 'user' as const, content: user },
        ],
      },
      { signal },
    ),
  );

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  await recordUsage(
    params.userId,
    { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    { operation: params.operation },
  );

  return text;
}

/**
 * Vision results are cached because re-analysing an identical photo costs a
 * full vision request for a byte-identical answer.
 *
 * The key is a SHA-256 of the whole compressed buffer, namespaced by profile.
 * An earlier implementation keyed on the first 100 base64 characters, which
 * collides across photos from the same camera and could serve one user's
 * analysis to another.
 */
interface CacheEntry {
  value: string;
  expiresAt: number;
}

const VISION_CACHE_TTL_MS = 10 * 60 * 1000;
const VISION_CACHE_MAX_ENTRIES = 200;
const visionCache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null {
  const entry = visionCache.get(key);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    visionCache.delete(key);
    return null;
  }

  // Refresh insertion order so the eviction below is least-recently-used.
  visionCache.delete(key);
  visionCache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: string): void {
  if (visionCache.size >= VISION_CACHE_MAX_ENTRIES) {
    const oldest = visionCache.keys().next().value;
    if (oldest !== undefined) visionCache.delete(oldest);
  }
  visionCache.set(key, { value, expiresAt: Date.now() + VISION_CACHE_TTL_MS });
}

async function compressImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const metadata = await sharp(buffer).metadata();
    const sizeKB = buffer.length / 1024;

    if (sizeKB < 200 && (!metadata.width || metadata.width <= 800)) {
      return { buffer, mimeType };
    }

    let pipeline = sharp(buffer).rotate(); // Applies EXIF orientation, then drops all EXIF.
    if (metadata.width && metadata.width > 800) pipeline = pipeline.resize(800);

    const compressed = await pipeline.jpeg({ quality: 70 }).toBuffer();
    logger.debug('Image compressed for vision request', {
      fromKB: Math.round(sizeKB),
      toKB: Math.round(compressed.length / 1024),
    });
    return { buffer: compressed, mimeType: 'image/jpeg' };
  } catch (error) {
    // Compression is an optimisation; the original buffer is still valid input.
    logger.warn('Image compression failed; sending original', { reason: (error as Error).message });
    return { buffer, mimeType };
  }
}

async function generateWithGeminiVision(params: GenerateWithImageParams): Promise<string> {
  const { system, user } = buildPrompt(params);
  const { buffer, mimeType } = await compressImage(params.imageBuffer, params.mimeType);

  const digest = createHash('sha256').update(buffer).digest('hex');
  const cacheKey = `vision:v1:${params.cacheScope}:${digest}`;

  const cached = cacheGet(cacheKey);
  if (cached !== null) {
    logger.debug('Vision cache hit', { scope: params.cacheScope });
    return cached;
  }

  const result = await withRetry('gemini.vision', (signal) =>
    gemini().models.generateContent({
      model: env.GEMINI_TEXT_MODEL,
      contents: [
        {
          role: 'user' as const,
          parts: [
            { inlineData: { mimeType, data: buffer.toString('base64') } },
            { text: user },
          ],
        },
      ],
      config: {
        systemInstruction: system,
        maxOutputTokens: params.maxOutputTokens ?? 1536,
        thinkingConfig: { thinkingBudget: params.thinkingBudget ?? 0 },
        abortSignal: signal,
      },
    }),
  );

  const text = result.text ?? '';

  await recordUsage(
    params.userId,
    usageFrom(result.usageMetadata, { prompt: system + user, completion: text }),
    { operation: params.operation },
  );

  if (text) cacheSet(cacheKey, text);
  return text;
}

/** Generates a text completion using the configured provider. */
export async function generateText(params: GenerateParams): Promise<string> {
  return env.LLM_PROVIDER === 'claude' ? generateWithClaude(params) : generateWithGemini(params);
}

/**
 * Generates a completion from an image plus text.
 *
 * The Claude provider has no vision path wired up here, so it falls back to a
 * text-only completion. Callers must supply a prompt that still makes sense
 * without the image; `describesImage: false` is passed through so the caller
 * can branch.
 */
export async function generateTextFromImage(
  params: GenerateWithImageParams,
): Promise<{ text: string; usedVision: boolean }> {
  if (env.LLM_PROVIDER === 'claude') {
    const text = await generateWithClaude(params);
    return { text, usedVision: false };
  }

  const text = await generateWithGeminiVision(params);
  return { text, usedVision: true };
}
