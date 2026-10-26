import type { Photobook, Prisma } from '@prisma/client';
import { emptyDocument, type OrderRequest } from '../packages/shared/src';
import {
  OrderKeyConflict,
  OrdersService,
  type OrderRepository,
  type OrderRecord,
  type OrderDraft,
} from '../apps/api/src/orders';
import { MockPaymentGateway } from '../apps/api/src/payments';

function json(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

function fixture() {
  const userId = crypto.randomUUID();
  const document = emptyDocument();
  const book: Photobook = {
    id: crypto.randomUUID(),
    userId,
    title: 'An adventure',
    templateId: 'travel',
    status: 'DRAFT',
    revision: 0,
    document: json(document),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const books = { owned: jest.fn(async () => book) };
  const rows = new Map<string, OrderRecord>();
  const repository: OrderRepository = {
    findByKey: jest.fn(async (key) => rows.get(key) ?? null),
    create: jest.fn(async (draft: OrderDraft) => {
      if (rows.has(draft.idempotencyKey)) throw new OrderKeyConflict();
      const id = crypto.randomUUID();
      const order: OrderRecord = {
        id,
        userId: draft.userId,
        idempotencyKey: draft.idempotencyKey,
        status: draft.status,
        totalCents: draft.totalCents,
        currency: 'USD',
        createdAt: new Date(),
        items: [
          {
            id: crypto.randomUUID(),
            orderId: id,
            bookId: draft.bookId,
            title: draft.title,
            size: draft.size,
            pageCount: draft.pageCount,
            priceCents: draft.totalCents,
            document: json(draft.document),
          },
        ],
      };
      rows.set(draft.idempotencyKey, order);
      return order;
    }),
  };
  const input: OrderRequest = {
    bookId: book.id,
    size: 'square',
    pageCount: 1,
    idempotencyKey: crypto.randomUUID(),
  };
  return {
    userId,
    book,
    books,
    rows,
    repository,
    input,
    service: new OrdersService(repository, books, new MockPaymentGateway()),
  };
}

test('simultaneous requests with one checkout key return the same persisted order', async () => {
  const f = fixture();
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  f.repository.findByKey = jest.fn(async (key) => {
    const snapshot = f.rows.get(key) ?? null;
    arrivals++;
    if (arrivals <= 2) {
      if (arrivals === 2) release();
      await gate;
    }
    return snapshot;
  });
  const results = await Promise.all([
    f.service.checkout(f.userId, f.input),
    f.service.checkout(f.userId, f.input),
  ]);
  expect(results[0]?.order.id).toBe(results[1]?.order.id);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  expect(f.rows.size).toBe(1);
  expect(f.repository.create).toHaveBeenCalledTimes(2);
});

test('replaying a completed checkout does not revalidate subsequently edited book content', async () => {
  const f = fixture();
  const first = await f.service.checkout(f.userId, f.input);
  f.book.document = json({ ...emptyDocument(), widthMm: 300, heightMm: 300 });
  const replay = await f.service.checkout(f.userId, f.input);
  expect(replay.order.id).toBe(first.order.id);
  expect(replay.created).toBe(false);
  expect(f.books.owned).toHaveBeenCalledTimes(1);
});

test('another user or changed request cannot reuse an existing checkout key', async () => {
  const f = fixture();
  await f.service.checkout(f.userId, f.input);
  await expect(f.service.checkout(crypto.randomUUID(), f.input)).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(
    f.service.checkout(f.userId, { ...f.input, bookId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(f.service.checkout(f.userId, { ...f.input, pageCount: 2 })).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(f.service.checkout(f.userId, { ...f.input, size: 'large' })).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(f.rows.size).toBe(1);
});

test('a conflicting winner is still checked for ownership and request equality', async () => {
  const f = fixture();
  const existing = await f.service.checkout(f.userId, f.input);
  f.repository.findByKey = jest
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...existing.order, userId: crypto.randomUUID() });
  f.repository.create = jest.fn(async () => {
    throw new OrderKeyConflict();
  });
  await expect(f.service.checkout(f.userId, f.input)).rejects.toMatchObject({ statusCode: 409 });
});

test('unrelated persistence failures are propagated and do not masquerade as successful orders', async () => {
  const f = fixture();
  const error = new Error('Database unavailable');
  f.repository.create = jest.fn(async () => {
    throw error;
  });
  await expect(f.service.checkout(f.userId, f.input)).rejects.toBe(error);
  expect(f.rows.size).toBe(0);
});
