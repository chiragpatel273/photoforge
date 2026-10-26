import { buildApp } from '../apps/api/src/app';
import { envSchema, infrastructure } from '../packages/shared/src/server';
import { templateDocument } from '../packages/shared/src';
import { Prisma } from '@prisma/client';

const suite = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

suite('real PostgreSQL and Redis API boundaries', () => {
  let infra: ReturnType<typeof infrastructure>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: string;
  let other: string;
  let id: string;
  let userId: string;
  let otherId: string;
  let memberId: string;

  beforeAll(async () => {
    infra = infrastructure(envSchema.parse({ ...process.env, NODE_ENV: 'test' }));
    app = await buildApp(infra, envSchema.parse({ ...process.env, NODE_ENV: 'test' }));
    await infra.db.template.upsert({
      where: { id: 'travel' },
      create: {
        id: 'travel',
        name: 'Travel',
        category: 'Travel',
        document: templateDocument('travel') as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    const a = await app.inject({ method: 'POST', url: '/auth/demo' });

    cookie = a.headers['set-cookie']!.toString().split(';')[0]!;
    userId = a.json().id;
    const b = await app.inject({
      method: 'POST',
      url: '/auth/demo',
      remoteAddress: '127.0.0.2',
    });

    other = b.headers['set-cookie']!.toString().split(';')[0]!;
    otherId = b.json().id;
  });

  afterAll(async () => {
    if (infra) {
      await infra.db.user.deleteMany({
        where: { id: { in: [userId, otherId, memberId].filter(Boolean) } },
      });
      await app.close();
      await infra.close();
    }
  });

  test('unauthenticated requests and cross-site mutations are rejected', async () => {
    expect((await app.inject({ url: '/photobooks' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/demo',
          headers: { origin: 'https://evil.example' },
        })
      ).statusCode,
    ).toBe(403);
  });

  test('registration, password login, and invalid credentials use real persisted users', async () => {
    const email = `member-${crypto.randomUUID()}@example.test`;
    const password = 'A strong test password 123';
    const registration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Test Member',
        email,
        password,
      },
    });

    expect(registration.statusCode).toBe(201);
    memberId = registration.json().id;
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toBeTruthy();
    const invalid = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'The wrong password 123' },
    });

    expect(invalid.statusCode).toBe(401);
    expect(registration.json().passwordHash).toBeUndefined();
  });

  test('invalid API bodies return a consistent error with correlation ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/photobooks',
      headers: { cookie },
      payload: { title: '', templateId: 'travel' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.requestId).toBeTruthy();
  });

  test('CRUD persists and enforces project ownership and optimistic locking', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/photobooks',
      headers: { cookie },
      payload: { title: 'Integration story', templateId: 'travel' },
    });

    expect(response.statusCode).toBe(201);
    id = response.json().id;
    const doc = response.json().document;

    expect(
      (await app.inject({ url: `/photobooks/${id}`, headers: { cookie: other } })).statusCode,
    ).toBe(404);
    const saved = await app.inject({
      method: 'PUT',
      url: `/photobooks/${id}`,
      headers: { cookie },
      payload: {
        title: 'Changed',
        revision: 0,
        document: doc,
      },
    });

    expect(saved.json().revision).toBe(1);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/photobooks/${id}`,
          headers: { cookie },
          payload: {
            title: 'Stale',
            revision: 0,
            document: doc,
          },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/photobooks/${id}`,
          headers: { cookie: other },
        })
      ).statusCode,
    ).toBe(404);
  });

  test('foreign assets cannot be included in a document', async () => {
    const response = await app.inject({ url: `/photobooks/${id}`, headers: { cookie } });
    const document = response.json().document;

    document.pages[0].elements.push({
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      type: 'image',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      crop: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });
    const saved = await app.inject({
      method: 'PUT',
      url: `/photobooks/${id}`,
      headers: { cookie },
      payload: {
        title: 'Invalid image',
        revision: 1,
        document,
      },
    });

    expect(saved.statusCode).toBe(422);
  });

  test('orders are idempotent and export/image records are owner protected', async () => {
    const key = crypto.randomUUID();
    const request = {
      method: 'POST' as const,
      url: '/orders',
      headers: { cookie },
      payload: {
        bookId: id,
        size: 'square',
        pageCount: 2,
        idempotencyKey: key,
      },
    };
    const a = await app.inject(request);
    const b = await app.inject(request);

    expect(a.statusCode).toBe(201);
    expect(a.json().id).toBe(b.json().id);
    const orders = await app.inject({ url: '/orders', headers: { cookie: other } });

    expect(orders.json().total).toBe(0);
    const exp = await app.inject({
      method: 'POST',
      url: `/photobooks/${id}/exports`,
      headers: { cookie },
    });

    expect(exp.statusCode).toBe(202);
    expect(
      (await app.inject({ url: `/exports/${exp.json().id}`, headers: { cookie: other } }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/images/${crypto.randomUUID()}/complete`,
          headers: { cookie: other },
        })
      ).statusCode,
    ).toBe(404);
  });

  test('logout invalidates a previously valid signed session', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ url: '/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });
});
