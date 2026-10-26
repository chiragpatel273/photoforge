import { FastifyInstance } from 'fastify';
import { RouteContext } from '../context';
import { documentSchema, jobOptions } from '@photoforge/shared';
import { json } from '../books';
import { HttpError, requireFound } from '../errors';
import { idSchema } from '../schemas';

export function registerExportsRoutes(app: FastifyInstance, context: RouteContext) {
  const { infra, auth, books } = context;

  app.post('/photobooks/:id/exports', { preHandler: auth }, async (req, reply) => {
    const book = await books.owned(idSchema.parse(req.params).id, req.user.sub);
    const doc = documentSchema.parse(book.document);

    await books.validateAssets(doc, req.user.sub, book.id);
    if ((await infra.db.exportJob.count({ where: { book: { userId: req.user.sub } } })) >= 100)
      throw new HttpError(422, 'Workspace export limit reached');
    let job = await infra.db.exportJob.upsert({
      where: { bookId_revision: { bookId: book.id, revision: book.revision } },
      create: {
        bookId: book.id,
        revision: book.revision,
        snapshot: json(doc),
      },
      update: {},
    });

    if (job.status === 'FAILED') {
      const old = await infra.pdfQueue.getJob(job.id);

      if (old && (await old.isFailed())) await old.remove();
      job = await infra.db.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          error: null,
          progress: 0,
        },
      });
    }
    if (job.status === 'QUEUED')
      await infra.pdfQueue
        .add('export', { id: job.id }, { ...jobOptions, jobId: job.id })
        .catch((e) => req.log.warn({ err: e }, 'Queue unavailable; reconciler will recover'));
    reply.code(202);

    return job;
  });

  app.get('/exports/:id', { preHandler: auth }, async (req) => {
    const { id } = idSchema.parse(req.params);
    const job = requireFound(
      await infra.db.exportJob.findFirst({ where: { id, book: { userId: req.user.sub } } }),
    );

    return {
      ...job,
      downloadUrl:
        job.status === 'READY' && job.objectKey
          ? await infra.downloadUrl(job.objectKey, `photoforge-${job.id}.pdf`)
          : undefined,
    };
  });
}
