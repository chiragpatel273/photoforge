import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';
import { randomUUID } from 'node:crypto';
import { uploadSchema, jobOptions } from '@photoforge/shared';
import { HttpError, requireFound } from '../errors';
import { authBody, idSchema } from '../schemas';

export function registerImagesRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra, auth, books } = context;

  app.get('/photobooks/:id/images', { preHandler: auth }, async (req) => {
    const book = await books.owned(idSchema.parse(req.params).id, req.user.sub);
    const assets = await infra.db.imageAsset.findMany({
      where: { bookId: book.id, userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return Promise.all(
      assets.map(async (a) => ({
        ...a,
        thumbnailUrl:
          a.status === 'READY' && a.thumbnailKey
            ? await infra.downloadUrl(a.thumbnailKey)
            : undefined,
        url:
          a.status === 'READY' && a.optimizedKey
            ? await infra.downloadUrl(a.optimizedKey)
            : undefined,
      })),
    );
  });

  app.post(
    '/photobooks/:id/images',
    { preHandler: auth, schema: authBody(uploadSchema) },
    async (req, reply) => {
      const book = await books.owned(idSchema.parse(req.params).id, req.user.sub);
      const input = uploadSchema.parse(req.body);

      if ((await infra.db.imageAsset.count({ where: { userId: req.user.sub } })) >= 200)
        throw new HttpError(422, 'Workspace limit: 200 images');
      const id = randomUUID();
      const key = `users/${req.user.sub}/books/${book.id}/originals/${id}`;
      const url = await infra.uploadUrl(key, input.mime, input.size);
      const asset = await infra.db.imageAsset.create({
        data: {
          id,
          userId: req.user.sub,
          bookId: book.id,
          filename: input.filename,
          mime: input.mime,
          size: input.size,
          originalKey: key,
        },
      });

      reply.code(201);

      return { asset, uploadUrl: url };
    },
  );

  app.post('/images/:id/complete', { preHandler: auth }, async (req) => {
    const { id } = idSchema.parse(req.params);
    const asset = requireFound(
      await infra.db.imageAsset.findFirst({ where: { id, userId: req.user.sub } }),
    );

    if (asset.status === 'READY' || asset.status === 'PROCESSING') return asset;
    const head = await infra.head(asset.originalKey).catch(() => {
      throw new HttpError(422, 'Upload not found. Upload the file before completing.');
    });

    if (head.ContentLength !== asset.size || head.ContentType !== asset.mime)
      throw new HttpError(422, 'Uploaded file differs from the declared size or type');
    if (asset.status === 'FAILED') {
      const old = await infra.imageQueue.getJob(id);

      if (old && (await old.isFailed())) await old.remove();
    }
    const updated = await infra.db.imageAsset.update({
      where: { id },
      data: { status: 'QUEUED', error: null },
    });

    await infra.imageQueue
      .add('process', { id }, { ...jobOptions, jobId: id })
      .catch((e) => req.log.warn({ err: e }, 'Queue unavailable; reconciler will recover'));

    return updated;
  });
}
