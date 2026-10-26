import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';
import { orderSchema, paginationSchema } from '@photoforge/shared';
import { authBody } from '../schemas';
import { MockPaymentGateway } from '../payments';
import { OrdersService, PrismaOrderRepository } from '../orders';

export function registerOrdersRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra, auth, books } = context;
  const orders = new OrdersService(
    new PrismaOrderRepository(infra.db),
    books,
    new MockPaymentGateway(),
  );

  app.post('/orders', { preHandler: auth, schema: authBody(orderSchema) }, async (req, reply) => {
    const result = await orders.checkout(req.user.sub, orderSchema.parse(req.body));
    reply.code(result.created ? 201 : 200);
    return result.order;
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
