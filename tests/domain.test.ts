import { priceCents, resolutionDpi, jobOptions } from '../packages/shared/src/domain';
import { documentSchema, uploadSchema, emptyDocument } from '../packages/shared/src';
import { hashPassword, verifyPassword } from '../apps/api/src/password';

test('pricing is computed in cents and includes the first twenty pages', () => {
  expect(priceCents('square', 1)).toBe(2900);
  expect(priceCents('square', 20)).toBe(2900);
  expect(priceCents('landscape', 22)).toBe(3750);
  expect(() => priceCents('large', 81)).toThrow();
});

test('print resolution depends on physical placement size', () => {
  expect(resolutionDpi(3000, 254, 1000)).toBe(300);
  expect(resolutionDpi(3000, 254, 500)).toBe(600);
});

test('validation rejects oversized images and duplicate page IDs', () => {
  expect(
    uploadSchema.safeParse({
      filename: 'a.png',
      mime: 'image/png',
      size: 21 * 1024 * 1024,
    }).success,
  ).toBe(false);
  const d = emptyDocument();

  d.pages.push(structuredClone(d.pages[0]!));
  expect(documentSchema.safeParse(d).success).toBe(false);
});

test('crop regions cannot escape image bounds', () => {
  const d = emptyDocument();

  d.pages[0]!.elements.push({
    id: crypto.randomUUID(),
    type: 'image',
    assetId: crypto.randomUUID(),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    crop: {
      x: 0.9,
      y: 0,
      width: 0.5,
      height: 1,
    },
  });
  expect(documentSchema.safeParse(d).success).toBe(false);
});

test('passwords are salted and verified with scrypt', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');

  expect(a).not.toBe(b);
  expect(await verifyPassword('correct horse battery', a)).toBe(true);
  expect(await verifyPassword('wrong', a)).toBe(false);
  expect(await verifyPassword('wrong', 'invalid')).toBe(false);
});

test('job policy uses bounded exponential retries and retained dead letters', () => {
  expect(jobOptions.attempts).toBe(4);
  expect(jobOptions.backoff).toEqual({ type: 'exponential', delay: 2000 });
  expect(jobOptions.removeOnFail).toBe(false);
});
