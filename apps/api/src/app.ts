import Fastify, { FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { z } from 'zod/v3';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Infrastructure, Environment } from '@photoforge/shared/server';
import { BooksService } from './books';
import { HttpError } from './errors';
import { registerAuthRoutes, createAuthGuard } from './modules/auth';
import { registerTemplatesRoutes } from './modules/templates';
import { registerPhotobooksRoutes } from './modules/photobooks';
import { registerImagesRoutes } from './modules/images';
import { registerExportsRoutes } from './modules/exports';
import { registerOrdersRoutes } from './modules/orders';

export async function buildApp(infra: Infrastructure, env: Environment) {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    bodyLimit: 2 * 1024 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    trustProxy:
      env.NODE_ENV === 'production' ? (_address: string, hop: number) => hop === 0 : false,
  });
  const books = new BooksService(infra);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: 'pf_session', signed: false },
  });
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    redis: infra.producerRedis,
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'PhotoForge API', version: '1.0.0' },
      servers: [{ url: '/api' }],
      components: {
        securitySchemes: {
          session: {
            type: 'apiKey',
            in: 'cookie',
            name: 'pf_session',
          },
        },
      },
    },
  });
  await app.register(swaggerUI, {
    routePrefix: '/docs',
    indexPrefix: '/api',
    uiConfig: { url: '/api/docs/json' },
  });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;

      if (origin && origin !== env.WEB_ORIGIN) throw new HttpError(403, 'Origin is not allowed');
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new HttpError(403, 'Cross-site request rejected');
    }
  });

  app.setErrorHandler<FastifyError>((err, req, reply) => {
    let status = err.statusCode ?? 500;
    let message = err.message;

    if (err instanceof z.ZodError) {
      status = 400;
      message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      status = 409;
      message = 'A matching record already exists';
    }
    if (status >= 500) {
      req.log.error({ err }, 'Request failed');
      message = 'Something went wrong. Please try again.';
    }
    reply.code(status).send({ error: { message, requestId: req.id } });
  });
  const auth = createAuthGuard(infra);

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async () => {
    await Promise.all([infra.db.$queryRaw`SELECT 1`, infra.redis.ping()]);

    return { status: 'ready' };
  });
  const context = {
    infra,
    env,
    auth,
    books,
  };

  registerAuthRoutes(app, context);
  registerTemplatesRoutes(app, context);
  registerPhotobooksRoutes(app, context);
  registerImagesRoutes(app, context);
  registerExportsRoutes(app, context);
  registerOrdersRoutes(app, context);

  return app;
}
