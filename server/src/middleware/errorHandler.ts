import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { getRequestId } from './requestContext.js';
import { captureException } from '../services/observability.js';

/**
 * Wire format for every error response.
 *
 * `error` stays a plain string so existing client code that reads
 * `response.data.error` keeps working; `code`, `action`, `fields` and
 * `requestId` are additive.
 */
interface ErrorBody {
  error: string;
  code: string;
  action?: string;
  fields?: Record<string, string>;
  requestId?: string;
}

interface Mapped {
  status: number;
  body: ErrorBody;
  /** True when the underlying cause is worth a full error-level log. */
  internal: boolean;
}

function fromZod(error: ZodError, requestId?: string): Mapped {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fields[key]) fields[key] = issue.message;
  }

  const first = error.issues[0];
  const label = first?.path.join('.');

  return {
    status: 400,
    internal: false,
    body: {
      error: label
        ? `${label} is not valid: ${first.message}`
        : (first?.message ?? 'Some of the information you entered is not valid.'),
      code: 'VALIDATION_FAILED',
      action: 'Correct the highlighted fields and try again.',
      fields,
      requestId,
    },
  };
}

function fromMongoose(error: unknown, requestId?: string): Mapped | null {
  if (error instanceof mongoose.Error.ValidationError) {
    const fields: Record<string, string> = {};
    for (const [key, issue] of Object.entries(error.errors)) {
      fields[key] = issue.message;
    }
    return {
      status: 400,
      internal: false,
      body: {
        error: 'Some of the information you entered is not valid.',
        code: 'VALIDATION_FAILED',
        action: 'Correct the highlighted fields and try again.',
        fields,
        requestId,
      },
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      internal: false,
      body: {
        error: 'That link or identifier is not valid.',
        code: 'INVALID_IDENTIFIER',
        action: 'Go back and open the item again from the list.',
        requestId,
      },
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  ) {
    return {
      status: 409,
      internal: false,
      body: {
        error: 'That record already exists.',
        code: 'DUPLICATE',
        action: 'Use a different value, or open the existing record instead.',
        requestId,
      },
    };
  }

  return null;
}

function fromMulter(error: MulterError, requestId?: string): Mapped {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      internal: false,
      body: {
        error: 'That image is larger than the 10 MB limit.',
        code: 'FILE_TOO_LARGE',
        action: 'Take the photo again at a lower resolution, or crop it before uploading.',
        requestId,
      },
    };
  }

  return {
    status: 400,
    internal: false,
    body: {
      error: 'That file could not be read.',
      code: 'INVALID_UPLOAD',
      action: 'Upload a JPEG, PNG, WEBP or HEIC image.',
      requestId,
    },
  };
}

function map(error: unknown, requestId?: string): Mapped {
  if (error instanceof AppError) {
    return {
      status: error.status,
      internal: error.status >= 500,
      body: {
        error: error.message,
        code: error.code,
        action: error.action,
        fields: error.details,
        requestId,
      },
    };
  }

  if (error instanceof ZodError) return fromZod(error, requestId);
  if (error instanceof MulterError) return fromMulter(error, requestId);

  const mongooseMapped = fromMongoose(error, requestId);
  if (mongooseMapped) return mongooseMapped;

  // Anything unrecognised is internal. The cause is logged, never returned.
  return {
    status: 500,
    internal: true,
    body: {
      error: 'Something went wrong on our side while handling that request.',
      code: 'INTERNAL_ERROR',
      action: 'Try again in a moment. If it keeps happening, contact support and quote this reference.',
      requestId,
    },
  };
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express delegates to the default handler once headers are sent; trying to
  // write a second response here would throw and mask the original failure.
  if (res.headersSent) {
    logger.error('Error raised after response started', error, { path: req.path });
    next(error);
    return;
  }

  const requestId = getRequestId();
  const mapped = map(error, requestId);

  if (mapped.internal) {
    logger.error('Unhandled request failure', error, { status: mapped.status, code: mapped.body.code });
    // Only genuine internal failures are reported. A 400 from a mistyped form
    // is not an incident, and reporting it would bury the ones that are.
    captureException(error, { status: mapped.status, code: mapped.body.code });
  } else {
    logger.warn('Request rejected', { status: mapped.status, code: mapped.body.code });
  }

  res.status(mapped.status).json(mapped.body);
}
