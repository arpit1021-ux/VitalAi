import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, z } from 'zod';

/**
 * Schema validation at the API boundary.
 *
 * Parsed output replaces the raw input, so handlers downstream read values that
 * are typed, coerced and stripped of unknown keys. That last property matters:
 * it is what stops a caller from smuggling extra fields into an update, and it
 * removes `__proto__`-style keys before they can reach Mongoose's update
 * casting.
 */
export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query has only a getter on newer Express versions, so the parsed
        // result is redefined rather than assigned.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      // The error handler renders ZodError as per-field messages.
      next(error instanceof ZodError ? error : error);
    }
  };
}

/** A MongoDB ObjectId, validated before it reaches a query. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'That identifier is not valid.');

/** Standard pagination, with an upper bound so a caller cannot request the world. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Free-text search input.
 *
 * Capped in length and stripped of regex metacharacters. Several routes
 * previously interpolated this straight into a $regex, which is both an
 * unindexed collection scan and a denial-of-service vector.
 */
export const searchTerm = z
  .string()
  .trim()
  .max(120, 'Search terms are limited to 120 characters.')
  .transform((value) => value.replace(/[.*+?^${}()|[\]\\]/g, ''));
