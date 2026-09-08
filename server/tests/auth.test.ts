import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Session, acceptConsent, createAccount, request, startTestServer, stopTestServer } from './helpers.js';

before(async () => {
  await startTestServer();
});

after(async () => {
  await stopTestServer();
});

describe('registration and sign-in', () => {
  it('rejects a password with no digit, naming the field', async () => {
    const response = await request<{ code: string; fields: Record<string, string> }>(
      'POST',
      '/api/auth/register',
      { body: { email: 'weak@vitalai.test', password: 'onlyletters' } },
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'VALIDATION_FAILED');
    assert.match(response.body.fields.password, /number/i);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const { email } = await createAccount();

    const wrongPassword = await request<{ error: string }>('POST', '/api/auth/login', {
      body: { email, password: 'WrongPassword123' },
    });
    const unknownAccount = await request<{ error: string }>('POST', '/api/auth/login', {
      body: { email: 'nobody@vitalai.test', password: 'WrongPassword123' },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownAccount.status, 401);
    // Differing here would let the endpoint be used to discover which
    // addresses are registered.
    assert.equal(wrongPassword.body.error, unknownAccount.body.error);
  });

  it('issues a session on registration', async () => {
    const { session } = await createAccount();
    assert.ok(session.get('accessToken'), 'no access token cookie');
    assert.ok(session.get('refreshToken'), 'no refresh token cookie');

    const me = await request('GET', '/api/auth/me', { session });
    assert.equal(me.status, 200);
  });

  it('refuses an anonymous caller with an actionable message', async () => {
    const response = await request<{ code: string; action: string }>('GET', '/api/auth/me');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHENTICATED');
    assert.ok(response.body.action, 'no next step offered to the user');
  });
});

describe('session rotation', () => {
  it('replaces the refresh token on every use', async () => {
    const { session } = await createAccount();
    const original = session.get('refreshToken');

    const refreshed = await request('POST', '/api/auth/refresh', { session });
    assert.equal(refreshed.status, 200);
    assert.notEqual(session.get('refreshToken'), original);
  });

  it('revokes every session when a rotated token is replayed', async () => {
    const { session } = await createAccount();
    const stolen = session.get('refreshToken')!;

    // The legitimate client rotates.
    assert.equal((await request('POST', '/api/auth/refresh', { session })).status, 200);

    // An attacker replays the token captured before that rotation.
    const attacker = new Session();
    attacker.set('refreshToken', stolen);

    const replay = await request<{ error: string }>('POST', '/api/auth/refresh', { session: attacker });
    assert.equal(replay.status, 401);
    assert.match(replay.body.error, /security/i);

    // The whole family goes, not just the replayed token: the legitimate
    // session must be dead too, or an attacker keeps their foothold.
    const afterBreach = await request('POST', '/api/auth/refresh', { session });
    assert.equal(afterBreach.status, 401);
  });
});

describe('consent', () => {
  it('blocks profile creation until health processing is accepted', async () => {
    const { session } = await createAccount();

    const blocked = await request<{ code: string }>('POST', '/api/profiles', {
      session,
      body: { name: 'Too Early' },
    });
    assert.equal(blocked.status, 403);

    await acceptConsent(session);

    const allowed = await request('POST', '/api/profiles', { session, body: { name: 'Now Fine' } });
    assert.equal(allowed.status, 201);
  });
});
