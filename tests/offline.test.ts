import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCents, resolutionDpi, jobOptions } from '../packages/shared/src/domain';
import { hashPassword, verifyPassword } from '../apps/api/src/password';

test('pricing handles base formats and extra pages in integer cents', () => {
  assert.equal(priceCents('square', 20), 2900);
  assert.equal(priceCents('landscape', 22), 3750);
  assert.equal(priceCents('large', 80), 12400);
});

test('pricing rejects invalid page counts', () => {
  for (const count of [0, -1, 1.5, 81, NaN]) assert.throws(() => priceCents('square', count));
});

test('physical DPI responds to printed size', () => {
  assert.equal(resolutionDpi(3000, 254, 1000), 300);
  assert.equal(resolutionDpi(3000, 254, 500), 600);
});

test('password salts differ, correct passwords verify, wrong passwords fail', async () => {
  const a = await hashPassword('a very good password');
  const b = await hashPassword('a very good password');

  assert.notEqual(a, b);
  assert.ok(await verifyPassword('a very good password', a));
  assert.equal(await verifyPassword('wrong password', a), false);
});

test('malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('password', 'invalid'), false);
  assert.equal(await verifyPassword('password', 'aa:bb'), false);
});

test('production retry policy is bounded and retains dead letters', () => {
  assert.equal(jobOptions.attempts, 4);
  assert.equal(jobOptions.backoff.type, 'exponential');
  assert.equal(jobOptions.removeOnFail, false);
});
