import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';
import { randomUUID } from 'node:crypto';
import {
  paginationSchema,
  documentSchema,
  createBookSchema,
  saveBookSchema,
  type Element,
} from '@photoforge/shared';
import { json } from '../books';
import { HttpError, requireFound } from '../errors';
import { authBody, idSchema } from '../schemas';

export function registerPhotobooksRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra, auth, books } = context;

  app.get('/photobooks', { preHandler: auth }, async (req) => {
    const { page, limit, q } = paginationSchema.parse(req.query);
    const where = {
      userId: req.user.sub,
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      infra.db.photobook.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      infra.db.photobook.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  });

  app.post(
    '/photobooks',
    { preHandler: auth, schema: authBody(createBookSchema) },
    async (req, reply) => {
      const input = createBookSchema.parse(req.body);

      if ((await infra.db.photobook.count({ where: { userId: req.user.sub } })) >= 50)
        throw new HttpError(422, 'Workspace limit: 50 books');
      const template = requireFound(
        await infra.db.template.findUnique({ where: { id: input.templateId } }),
      );
      const doc = documentSchema.parse(template.document);

      doc.pages = doc.pages.map((p) => ({
        ...p,
        id: randomUUID(),
        elements: p.elements.map((e) => ({ ...e, id: randomUUID() })),
      }));
      const book = await infra.db.photobook.create({
        data: {
          userId: req.user.sub,
          title: input.title,
          templateId: template.id,
          document: json(doc),
          pages: {
            create: doc.pages.map((p, position) => ({
              id: p.id,
              position,
              content: json(p),
            })),
          },
        },
      });

      reply.code(201);

      return book;
    },
  );

  app.get('/photobooks/:id', { preHandler: auth }, async (req) =>
    books.owned(idSchema.parse(req.params).id, req.user.sub),
  );

  app.put(
    '/photobooks/:id',
    { preHandler: auth, schema: authBody(saveBookSchema) },
    async (req) => {
      const { id } = idSchema.parse(req.params);
      const input = saveBookSchema.parse(req.body);

      return books.save(id, req.user.sub, input.title, input.revision, input.document);
    },
  );

  app.delete('/photobooks/:id', { preHandler: auth }, async (req) => {
    const book = await books.owned(idSchema.parse(req.params).id, req.user.sub);

    await infra.db.photobook.delete({ where: { id: book.id } });

    return { ok: true };
  });

  app.post('/photobooks/:id/duplicate', { preHandler: auth }, async (req, reply) => {
    const book = await books.owned(idSchema.parse(req.params).id, req.user.sub);

    if ((await infra.db.photobook.count({ where: { userId: req.user.sub } })) >= 50)
      throw new HttpError(422, 'Workspace limit: 50 books');
    const doc = documentSchema.parse(book.document);
    const assets = await infra.db.imageAsset.findMany({
      where: {
        bookId: book.id,
        userId: req.user.sub,
        status: 'READY',
      },
    });

    if (
      (await infra.db.imageAsset.count({ where: { userId: req.user.sub } })) + assets.length >
      200
    )
      throw new HttpError(
        422,
        'Duplicating these photos would exceed the 200-image workspace limit',
      );
    const ids = new Map<string, string>(assets.map((a) => [a.id, randomUUID()] as const));

    doc.pages = doc.pages.map((p) => ({
      ...p,
      id: randomUUID(),
      elements: p.elements.map(
        (e): Element =>
          e.type === 'image'
            ? {
                ...e,
                id: randomUUID(),
                assetId: ids.get(e.assetId) ?? e.assetId,
              }
            : { ...e, id: randomUUID() },
      ),
    }));
    const duplicate = await infra.db.$transaction(async (tx) => {
      const created = await tx.photobook.create({
        data: {
          title: `${book.title.slice(0, 110)} (copy)`,
          templateId: book.templateId,
          userId: req.user.sub,
          document: json(doc),
          pages: {
            create: doc.pages.map((p, position) => ({
              id: p.id,
              position,
              content: json(p),
            })),
          },
        },
      });

      for (const a of assets)
        await tx.imageAsset.create({
          data: {
            ...a,
            id: ids.get(a.id),
            bookId: created.id,
            originalKey: a.originalKey,
            createdAt: undefined,
            updatedAt: undefined,
          },
        });

      return created;
    });

    reply.code(201);

    return duplicate;
  });
}
