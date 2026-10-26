import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';
import {
  documentSchema,
  orderSchema,
  paginationSchema,
  priceCents,
  sizes,
} from '@photoforge/shared';
import { json } from '../books';
import { HttpError } from '../errors';
import { authBody } from '../schemas';
import { MockPaymentGateway } from '../payments';

export function registerOrdersRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra, auth, books } = context;
  const payments = new MockPaymentGateway();

  app.post('/orders', { preHandler: auth, schema: authBody(orderSchema) }, async (req, reply) => {
    const input = orderSchema.parse(req.body);
    const book = await books.owned(input.bookId, req.user.sub);
    const doc = documentSchema.parse(book.document);

    if (doc.pages.length !== input.pageCount)
      throw new HttpError(409, 'Page count changed. Refresh your order.');
    const dims = sizes[input.size];

    if (doc.widthMm !== dims.widthMm || doc.heightMm !== dims.heightMm)
      throw new HttpError(422, 'Select a size matching your book dimensions');
    const existing = await infra.db.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });

    if (existing) {
      if (
        existing.userId !== req.user.sub ||
        existing.items[0]?.bookId !== book.id ||
        existing.items[0]?.size !== input.size ||
        existing.items[0]?.pageCount !== input.pageCount
      )
        throw new HttpError(409, 'Checkout key already used');
      return existing;
    }
    const total = priceCents(input.size, input.pageCount);
    const payment = await payments.confirm({
      amountCents: total,
      currency: 'USD',
      idempotencyKey: input.idempotencyKey,
    });
    const order = await infra.db.order.create({
      data: {
        userId: req.user.sub,
        idempotencyKey: input.idempotencyKey,
        status: payment.status,
        totalCents: total,
        items: {
          create: {
            bookId: book.id,
            title: book.title,
            size: input.size,
            pageCount: input.pageCount,
            priceCents: total,
            document: json(doc),
          },
        },
      },
      include: { items: true },
    });

    reply.code(201);

    return order;
  });

  app.get('/orders', { preHandler: auth }, async (req) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const where = { userId: req.user.sub };
    const [items, total] = await Promise.all([
      infra.db.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      infra.db.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  });
}
