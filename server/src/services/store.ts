import { Redis } from 'ioredis';
import { env, isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Counter and cache storage for rate limits, token budgets and cached model
 * responses.
 *
 * Two backends. `memory` is a single-process map for local development.
 * `redis` is required in production, because in-process counters reset on every
 * deploy and are per-instance — a user's daily token budget enforced in process
 * memory is not a budget, it is a suggestion, and the same is true of a spend
 * kill-switch that forgets it was tripped.
 */

export interface KeyValueStore {
  /** Increments a counter, returning the new value. Sets the TTL on creation. */
  increment(key: string, amount: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Seconds until the key expires; null when it does not exist. */
  ttl(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
  healthy(): boolean;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, MemoryEntry>();

  private read(key: string): MemoryEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async increment(key: string, amount: number, ttlSeconds: number): Promise<number> {
    const existing = this.read(key);
    const next = (existing ? Number(existing.value) : 0) + amount;

    this.entries.set(key, {
      value: String(next),
      // The window is anchored to first write, so a counter cannot be kept
      // alive indefinitely by continuous traffic.
      expiresAt: existing?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });

    return next;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async ttl(key: string): Promise<number | null> {
    const entry = this.read(key);
    if (!entry) return null;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  healthy(): boolean {
    return true;
  }
}

class RedisStore implements KeyValueStore {
  private readonly client: Redis;
  private connected = false;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      // A failed counter write must not hang a request; fail fast and let the
      // caller decide whether to allow or deny.
      commandTimeout: 2000,
    });

    this.client.on('ready', () => {
      this.connected = true;
      logger.info('Redis connected');
    });

    this.client.on('error', (error: Error) => {
      this.connected = false;
      logger.error('Redis error', error);
    });
  }

  async increment(key: string, amount: number, ttlSeconds: number): Promise<number> {
    // INCRBY and EXPIRE in one round trip. NX on the expiry anchors the window
    // to the first write rather than extending it on every increment.
    const results = await this.client
      .multi()
      .incrby(key, amount)
      .expire(key, ttlSeconds, 'NX')
      .exec();

    const value = results?.[0]?.[1];
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async ttl(key: string): Promise<number | null> {
    const seconds = await this.client.ttl(key);
    return seconds >= 0 ? seconds : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  healthy(): boolean {
    return this.connected;
  }
}

function create(): KeyValueStore {
  if (env.REDIS_URL) {
    logger.info('Using Redis for counters and cache');
    return new RedisStore(env.REDIS_URL);
  }

  if (isProduction) {
    // Unreachable: env validation rejects this combination at boot. Kept as a
    // guard so the invariant is enforced where it is relied upon.
    throw new Error('REDIS_URL is required in production');
  }

  logger.warn('Using in-process store: counters reset on restart and are not shared between instances');
  return new MemoryStore();
}

export const store: KeyValueStore = create();
