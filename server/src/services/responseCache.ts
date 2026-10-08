import { store } from './store.js';
import { logger } from '../utils/logger.js';

/**
 * Caches a generated answer in the shared store.
 *
 * The dashboard's daily recipes, daily tip and coach note are identical for a
 * profile for hours at a time, so each one used to be held in a module-level
 * `Map`. Two problems with that. It is per-instance, so the same user gets a
 * different "cached" answer depending on which server takes the request, and
 * every deploy pays for all of it again. And the keys included a profile id and
 * a date with nothing evicting them, so the map grew for the lifetime of the
 * process — a slow leak that only shows up under real traffic.
 *
 * A cache is an optimisation, so a store failure never fails the request: it
 * falls through to generating the answer.
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const namespaced = `cache:v1:${key}`;

  try {
    const hit = await store.get(namespaced);
    if (hit) return { value: JSON.parse(hit) as T, cached: true };
  } catch (error) {
    logger.warn('Response cache read failed; generating instead', { key });
  }

  const value = await produce();

  try {
    await store.set(namespaced, JSON.stringify(value), ttlSeconds);
  } catch (error) {
    logger.warn('Response cache write failed', { key });
  }

  return { value, cached: false };
}
