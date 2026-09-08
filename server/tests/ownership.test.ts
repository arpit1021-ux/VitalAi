import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { acceptConsent, createAccount, createProfile, request, startTestServer, stopTestServer } from './helpers.js';

before(async () => {
  await startTestServer();
});

after(async () => {
  await stopTestServer();
});

/**
 * One account must never reach another's data.
 *
 * These assert the boundary from the outside, against real HTTP, because the
 * ownership check is re-derived per route and a single missed filter is a
 * cross-account leak.
 */
describe('cross-account isolation', () => {
  it("refuses to read another account's profile", async () => {
    const owner = await createAccount();
    await acceptConsent(owner.session);
    const profileId = await createProfile(owner.session, 'Owner Profile');

    const intruder = await createAccount();

    const response = await request('GET', `/api/profiles/${profileId}`, { session: intruder.session });
    assert.equal(response.status, 404, 'another account could read this profile');
  });

  it("refuses to update another account's profile", async () => {
    const owner = await createAccount();
    await acceptConsent(owner.session);
    const profileId = await createProfile(owner.session, 'Owner Profile');

    const intruder = await createAccount();

    const response = await request('PUT', `/api/profiles/${profileId}`, {
      session: intruder.session,
      body: { name: 'Hijacked' },
    });
    assert.equal(response.status, 404);

    const stillOwned = await request<{ profile: { name: string } }>('GET', `/api/profiles/${profileId}`, {
      session: owner.session,
    });
    assert.equal(stillOwned.body.profile.name, 'Owner Profile');
  });

  it("refuses to read another account's family insights", async () => {
    const owner = await createAccount();
    const intruder = await createAccount();

    const response = await request('GET', `/api/insights/family/${owner.id}`, {
      session: intruder.session,
    });
    assert.equal(response.status, 403);
  });
});

describe('input validation at the boundary', () => {
  it('rejects prototype-pollution keys rather than absorbing them', async () => {
    const { session } = await createAccount();
    await acceptConsent(session);
    const profileId = await createProfile(session);

    // Sent as a raw string on purpose. Written as an object literal,
    // `__proto__` is prototype-setter syntax rather than a property, so
    // JSON.stringify silently drops it and the request proves nothing. Only
    // JSON.parse on the server creates a real own `__proto__` key — which is
    // exactly the shape the Mongoose advisory describes.
    const response = await request<{ code: string }>('PUT', `/api/profiles/${profileId}`, {
      session,
      rawBody: '{"name":"Renamed","__proto__":{"polluted":true}}',
    });

    assert.equal(response.status, 400, 'a __proto__ key was accepted rather than rejected');
    assert.equal(response.body.code, 'VALIDATION_FAILED');

    assert.equal(
      ({} as Record<string, unknown>).polluted,
      undefined,
      'Object.prototype was polluted in the test process',
    );
  });

  it('rejects a dotted __proto__ path, which update casting expands', async () => {
    const { session } = await createAccount();
    await acceptConsent(session);
    const profileId = await createProfile(session);

    // The advisory's other shape: a dotted path that Mongoose expands into a
    // nested write. The schema does not declare this key, so it must not pass.
    const response = await request<{ code: string }>('PUT', `/api/profiles/${profileId}`, {
      session,
      rawBody: '{"name":"Renamed","__proto__.polluted":true}',
    });

    assert.equal(response.status, 400, 'a dotted __proto__ path was accepted');
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  it('rejects fields the schema does not declare', async () => {
    const { session } = await createAccount();
    await acceptConsent(session);
    const profileId = await createProfile(session);

    const response = await request('PUT', `/api/profiles/${profileId}`, {
      session,
      body: { name: 'Renamed', userId: '000000000000000000000000' },
    });

    // Reassigning ownership must not be possible through an update.
    assert.equal(response.status, 400);
  });

  it('rejects a malformed identifier before it reaches a query', async () => {
    const { session } = await createAccount();

    const response = await request<{ code: string }>('GET', '/api/profiles/not-an-object-id', {
      session,
    });
    assert.equal(response.status, 400);
  });
});

describe('public projections', () => {
  it('never exposes an author email in the community feed', async () => {
    const { session } = await createAccount();

    const response = await request('GET', '/api/community/feed', { session });
    assert.equal(response.status, 200);

    const serialised = JSON.stringify(response.body);
    assert.equal(serialised.includes('@vitalai.test'), false, 'an email address reached the feed');
    assert.equal(serialised.includes('"email"'), false, 'an email field reached the feed');
  });
});
