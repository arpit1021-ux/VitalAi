import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';

/**
 * Test harness.
 *
 * Boots the real application on an ephemeral port and talks to it over HTTP,
 * so the middleware stack under test is the one that ships: the same CORS
 * rules, validation, rate limits and error handler.
 */

let server: Server | null = null;
let baseUrl = '';

/**
 * Refuses to destroy anything that is not provably a test database.
 *
 * This runs AFTER connecting and inspects the live connection, not the URI
 * string. An earlier version validated TEST_MONGODB_URI and then called
 * connectDB(), which reads the URI parsed from .env at import time — so the
 * guard passed on one database and the drop landed on another. Checking the
 * connection itself removes the gap between what was validated and what is
 * about to be erased.
 */
function applicationDatabaseName(): string {
  // Parsed from the string rather than opened: this only needs the path
  // segment, and the credentials should not be handled at all.
  const withoutQuery = env.MONGODB_URI.split('?')[0];
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/(.*)$/.exec(withoutQuery);
  return match?.[1] ?? '';
}

function assertConnectedToTestDatabase(): void {
  const name = mongoose.connection.name;
  const host = mongoose.connection.host ?? 'unknown';

  if (!name) {
    throw new Error(
      'Connected without a database name. Give TEST_MONGODB_URI an explicit database, ' +
        'e.g. mongodb://127.0.0.1:27017/vitalai-test',
    );
  }

  // The decisive check. A name test alone is not enough: a cluster's default
  // database can itself contain "test" (Atlas generates names like
  // "<hash>_test"), so matching on the name would happily approve dropping the
  // application's own data. Whatever the names are, the test target must not
  // be the database the application runs on.
  const appDatabase = applicationDatabaseName();
  if (appDatabase && name === appDatabase) {
    throw new Error(
      `Refusing to drop database "${name}" on ${host}: it is the database MONGODB_URI points at. ` +
        'Give TEST_MONGODB_URI a different database on the same cluster.',
    );
  }

  if (!appDatabase) {
    throw new Error(
      `MONGODB_URI has no database name, so the application database cannot be identified and ` +
        `"${name}" cannot be confirmed safe to drop. Add an explicit database to MONGODB_URI ` +
        '(for example .../vitalai?retryWrites=true) and re-run.',
    );
  }

  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to drop database "${name}" on ${host}: its name does not contain "test". ` +
        'These tests erase the database they run against.',
    );
  }
}

export async function startTestServer(): Promise<string> {
  if (baseUrl) return baseUrl;

  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    throw new Error(
      'TEST_MONGODB_URI is not set. Point it at a scratch database, ' +
        'e.g. mongodb://127.0.0.1:27017/vitalai-test',
    );
  }

  // Passed explicitly rather than through process.env: the environment module
  // has already been parsed by this point and would ignore a late assignment.
  try {
    await connectDB(uri);
  } catch (error) {
    const host = uri.replace(/\/\/[^@]*@/, '//');
    throw new Error(
      `Could not reach MongoDB for tests at ${host}.\n\n` +
        'Either start a local MongoDB (docker run -d -p 27017:27017 mongo:7), or point\n' +
        'TEST_MONGODB_URI at a remote database whose name contains "test" — it will be\n' +
        'dropped on every run, so it must not be one you use for anything else.',
      { cause: error },
    );
  }
  assertConnectedToTestDatabase();

  await mongoose.connection.dropDatabase();

  const app = createApp();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });

  const address = server!.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  return baseUrl;
}

export async function stopTestServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
  await disconnectDB();
  baseUrl = '';
}

export interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  body: T;
  cookies: string[];
}

/** A cookie jar, so a test can hold a session the way a browser does. */
export class Session {
  private jar = new Map<string, string>();

  get cookieHeader(): string {
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get(name: string): string | undefined {
    return this.jar.get(name);
  }

  set(name: string, value: string): void {
    this.jar.set(name, value);
  }

  absorb(setCookies: string[]): void {
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index === -1) continue;

      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();

      // An expiry in the past is a deletion.
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }
}

export async function request<T = Record<string, unknown>>(
  method: string,
  path: string,
  options: {
    session?: Session;
    body?: unknown;
    /**
     * Sent verbatim, bypassing JSON.stringify.
     *
     * Required for payloads that JavaScript cannot express as an object
     * literal. `{ __proto__: {...} }` is prototype-setter syntax: it creates no
     * own property, so stringify drops it and the request carries nothing
     * unusual. Only a raw string puts a real `__proto__` key on the wire.
     */
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { ...options.headers };

  if (options.body !== undefined || options.rawBody !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.session) {
    const cookies = options.session.cookieHeader;
    if (cookies) headers.Cookie = cookies;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  options.session?.absorb(setCookies);

  const text = await response.text();
  let body: T;
  try {
    body = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    body = { raw: text } as unknown as T;
  }

  return { status: response.status, body, cookies: setCookies };
}

let counter = 0;

/** Registers a fresh account and returns a session holding its cookies. */
export async function createAccount(): Promise<{ session: Session; email: string; id: string }> {
  counter += 1;
  const email = `test-${Date.now()}-${counter}@vitalai.test`;
  const session = new Session();

  const response = await request<{ user: { id: string } }>('POST', '/api/auth/register', {
    session,
    body: { email, password: 'TestPassword123' },
  });

  if (response.status !== 201) {
    throw new Error(`Could not create test account: ${JSON.stringify(response.body)}`);
  }

  return { session, email, id: response.body.user.id };
}

/** Records consent so profile creation is permitted. */
export async function acceptConsent(session: Session): Promise<void> {
  const status = await request<{ currentVersion: string }>('GET', '/api/account/consent', { session });

  await request('POST', '/api/account/consent', {
    session,
    body: { version: status.body.currentVersion, acceptHealthDataProcessing: true },
  });
}

export async function createProfile(session: Session, name = 'Test Profile'): Promise<string> {
  const response = await request<{ profile: { _id: string } }>('POST', '/api/profiles', {
    session,
    body: { name },
  });

  if (response.status !== 201) {
    throw new Error(`Could not create profile: ${JSON.stringify(response.body)}`);
  }

  return response.body.profile._id;
}
