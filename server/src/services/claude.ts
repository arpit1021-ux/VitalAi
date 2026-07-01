import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { env } from '../config/env.js';

const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY || undefined });
const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const VITALAI_DISCLAIMER = `You are VitalAI, an educational health information assistant. You provide evidence-based, general health information only. You never diagnose conditions, prescribe treatments, or claim medical certainty. Always recommend consulting a licensed professional for personal medical decisions. Frame all responses as "research suggests," "studies indicate," "generally recommended" — never as definitive medical advice.`;

interface QueryClaudeParams {
  systemPrompt: string;
  userMessage: string;
  context?: string;
}

interface QueryClaudeWithImageParams extends QueryClaudeParams {
  imageBuffer: Buffer;
  mimeType: string;
}

function buildMessages(params: QueryClaudeParams) {
  const fullSystemPrompt = `${VITALAI_DISCLAIMER}\n\n${params.systemPrompt}`;
  let fullUserMessage = params.userMessage;
  if (params.context) {
    fullUserMessage = `[RETRIEVED CONTEXT]\n${params.context}\n[END CONTEXT]\n\n${params.userMessage}`;
  }
  return { fullSystemPrompt, fullUserMessage };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error: any): boolean {
  const status = error?.status || error?.code || error?.httpStatusCode;
  return status === 429 || status === 503 || status === 500;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries && isTransientError(error)) {
        const delay = (attempt + 1) * 2000;
        console.warn(`[LLM] Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function queryClaudeProvider(params: QueryClaudeParams): Promise<string> {
  const { fullSystemPrompt, fullUserMessage } = buildMessages(params);

  const response = await withRetry(() =>
    anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: fullUserMessage }],
    })
  );

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

async function queryGeminiProvider(params: QueryClaudeParams): Promise<string> {
  const { fullSystemPrompt, fullUserMessage } = buildMessages(params);

  const result = await withRetry(() =>
    genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullUserMessage,
      config: {
        systemInstruction: fullSystemPrompt,
      },
    })
  );

  return result.text ?? '';
}

const imageCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCachedResult(key: string): string | null {
  const entry = imageCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.result;
  }
  imageCache.delete(key);
  return null;
}

function setCachedResult(key: string, result: string): void {
  if (imageCache.size > 50) {
    const oldest = imageCache.keys().next().value;
    if (oldest) imageCache.delete(oldest);
  }
  imageCache.set(key, { result, timestamp: Date.now() });
}

async function compressImage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const metadata = await sharp(buffer).metadata();
    const sizeKB = buffer.length / 1024;

    if (sizeKB < 200 && (!metadata.width || metadata.width <= 800)) {
      return { buffer, mimeType };
    }

    let pipeline = sharp(buffer);

    if (metadata.width && metadata.width > 800) {
      pipeline = pipeline.resize(800);
    }

    pipeline = pipeline.jpeg({ quality: 70 });

    const compressed = await pipeline.toBuffer();
    console.log(`[Image] Compressed from ${Math.round(sizeKB)}KB to ${Math.round(compressed.length / 1024)}KB`);
    return { buffer: compressed, mimeType: 'image/jpeg' };
  } catch (err) {
    console.warn('[Image] Compression failed, using original:', err);
    return { buffer, mimeType };
  }
}

async function queryGeminiWithImageProvider(params: QueryClaudeWithImageParams): Promise<string> {
  const { fullSystemPrompt, fullUserMessage } = buildMessages(params);

  const { buffer: compressedBuffer, mimeType: compressedMime } = await compressImage(params.imageBuffer, params.mimeType);
  const base64Data = compressedBuffer.toString('base64');

  const cacheKey = `vision:${compressedMime}:${base64Data.slice(0, 100)}`;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    console.log('[Gemini Vision] Returning cached result');
    return cached;
  }

  console.log(`[Gemini Vision] Sending image: ${compressedMime}, base64 length: ${base64Data.length}`);

  const contents = [
    {
      role: 'user' as const,
      parts: [
        { inlineData: { mimeType: compressedMime, data: base64Data } },
        { text: fullUserMessage },
      ],
    },
  ];

  const result = await withRetry(() =>
    genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: fullSystemPrompt,
      },
    })
  );

  const text = result.text ?? '';
  setCachedResult(cacheKey, text);
  return text;
}

export async function queryClaude(params: QueryClaudeParams): Promise<string> {
  if (env.LLM_PROVIDER === 'claude') {
    return queryClaudeProvider(params);
  }
  return queryGeminiProvider(params);
}

export async function queryClaudeWithImage(params: QueryClaudeWithImageParams): Promise<string> {
  if (env.LLM_PROVIDER === 'claude') {
    return queryClaudeProvider(params);
  }
  return queryGeminiWithImageProvider(params);
}
