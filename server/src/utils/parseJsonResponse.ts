/**
 * Robustly extract and parse a JSON object from a model response string.
 * Handles: preamble text, fenced code blocks, nested braces, trailing text.
 */
export function parseJsonResponse<T>(raw: string, fallback: T): T {
  // 1. Try fenced code block first (```json ... ``` or ``` ... ```)
  const fencedMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim()) as T;
    } catch {
      // fall through
    }
  }

  // 2. Find first { and match to its closing } using bracket depth
  const start = raw.indexOf('{');
  if (start === -1) return fallback;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.substring(start, i + 1)) as T;
        } catch {
          return fallback;
        }
      }
    }
  }

  // 3. Braces didn't balance — try parsing what we have
  try {
    return JSON.parse(raw.substring(start)) as T;
  } catch {
    return fallback;
  }
}

import type { ZodTypeAny, z } from 'zod';
import { logger } from './logger.js';

/**
 * Extracts JSON from a model response and validates it against a schema.
 *
 * Returns null when the output cannot be made to fit, so the caller can show a
 * clear failure rather than persisting a partially-formed health verdict.
 */
export function parseValidatedJson<TSchema extends ZodTypeAny>(
  raw: string,
  schema: TSchema,
  context: { operation: string },
): z.infer<TSchema> | null {
  const extracted = parseJsonResponse<unknown>(raw, null);

  if (extracted === null) {
    logger.warn('Model returned no parseable JSON', {
      operation: context.operation,
      responseLength: raw.length,
    });
    return null;
  }

  const result = schema.safeParse(extracted);

  if (!result.success) {
    logger.warn('Model output failed schema validation', {
      operation: context.operation,
      issues: result.error.issues.slice(0, 5).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return null;
  }

  return result.data;
}
