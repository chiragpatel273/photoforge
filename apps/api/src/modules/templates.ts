import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';

export function registerTemplatesRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra } = context;

  app.get('/templates', async () => {
    const cached = await infra.producerRedis.get('templates:v1').catch(() => null);

    if (cached) return JSON.parse(cached) as unknown;
    const templates = await infra.db.template.findMany({ orderBy: { name: 'asc' } });

    await infra.producerRedis
      .set('templates:v1', JSON.stringify(templates), 'EX', 300)
      .catch(() => {});

    return templates;
  });
}
