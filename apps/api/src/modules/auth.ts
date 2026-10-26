import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';
import { randomUUID } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Infrastructure } from '@photoforge/shared/server';
import { registerSchema, credentialsSchema } from '@photoforge/shared';
import { hashPassword, verifyPassword } from '../password';
import { HttpError } from '../errors';
import { authBody } from '../schemas';

export function registerAuthRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra, env, auth } = context;

  async function session(
    reply: FastifyReply,
    user: {
      id: string;
      sessionVersion: number;
      name: string;
      email: string;
      isGuest: boolean;
    },
  ) {
    const token = await reply.jwtSign(
      { sub: user.id, version: user.sessionVersion },
      { expiresIn: user.isGuest ? '24h' : '7d' },
    );

    reply.setCookie('pf_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: user.isGuest ? 86400 : 604800,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isGuest: user.isGuest,
    };
  }

  app.post(
    '/auth/register',
    {
      schema: authBody(registerSchema),
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = registerSchema.parse(req.body);
      const user = await infra.db.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });

      reply.code(201);

      return session(reply, user);
    },
  );

  app.post(
    '/auth/login',
    {
      schema: authBody(credentialsSchema),
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = credentialsSchema.parse(req.body);
      const user = await infra.db.user.findUnique({ where: { email: input.email } });
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? '00000000000000000000000000000000:' + '00'.repeat(64),
      );

      if (!user || !valid || user.isGuest)
        throw new HttpError(401, 'Email or password is incorrect');
      return session(reply, user);
    },
  );

  app.post(
    '/auth/demo',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (_req, reply) => {
      const user = await infra.db.user.create({
        data: {
          email: `${randomUUID()}@demo.invalid`,
          name: 'Creative explorer',
          isGuest: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      return session(reply, user);
    },
  );

  app.get('/auth/me', { preHandler: auth }, async (req) => {
    const u = await infra.db.user.findUniqueOrThrow({ where: { id: req.user.sub } });

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      isGuest: u.isGuest,
    };
  });

  app.post('/auth/logout', { preHandler: auth }, async (req, reply) => {
    await infra.db.user.update({
      where: { id: req.user.sub },
      data: { sessionVersion: { increment: 1 } },
    });
    reply.clearCookie('pf_session', { path: '/' });

    return { ok: true };
  });
}

export function createAuthGuard(infra: Infrastructure) {
  return async function auth(req: FastifyRequest) {
    try {
      await req.jwtVerify({ onlyCookie: true });
    } catch {
      throw new HttpError(401, 'Please sign in');
    }
    const user = await infra.db.user.findUnique({ where: { id: req.user.sub } });

    if (
      !user ||
      user.sessionVersion !== req.user.version ||
      (user.expiresAt && user.expiresAt < new Date())
    )
      throw new HttpError(401, 'Session expired');
  };
}
