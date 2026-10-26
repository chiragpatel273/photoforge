import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import pino from 'pino';
import { envSchema, infrastructure } from '@photoforge/shared/server';
import { documentSchema, jobOptions } from '@photoforge/shared';
import { processImage } from './images';
import { generatePdf } from './pdf';

const log = pino();
const env = envSchema.parse(process.env);
const infra = infrastructure(env);

async function image(
  job: Job<{
    id: string;
  }>,
) {
  const asset = await infra.db.imageAsset.findUnique({ where: { id: job.data.id } });

  if (!asset || asset.status === 'READY') return;
  await infra.db.imageAsset.update({
    where: { id: asset.id },
    data: { status: 'PROCESSING', error: null },
  });
  const head = await infra.head(asset.originalKey);

  if (head.ContentLength !== asset.size || head.ContentType !== asset.mime)
    throw new Error('Upload metadata changed');
  const result = await processImage(await infra.get(asset.originalKey), asset.mime);
  const prefix = `users/${asset.userId}/books/${asset.bookId}/processed/${asset.id}`;

  await Promise.all([
    infra.put(`${prefix}.source`, result.original, asset.mime),
    infra.put(`${prefix}.webp`, result.optimized, 'image/webp'),
    infra.put(`${prefix}.thumb.webp`, result.thumbnail, 'image/webp'),
  ]);
  await infra.db.imageAsset.update({
    where: { id: asset.id },
    data: {
      status: 'READY',
      originalKey: `${prefix}.source`,
      width: result.width,
      height: result.height,
      optimizedKey: `${prefix}.webp`,
      thumbnailKey: `${prefix}.thumb.webp`,
      error: null,
    },
  });
}

async function pdf(
  job: Job<{
    id: string;
  }>,
) {
  const task = await infra.db.exportJob.findUnique({
    where: { id: job.data.id },
    include: { book: true },
  });

  if (!task || task.status === 'READY') return;
  await infra.db.exportJob.update({
    where: { id: task.id },
    data: {
      status: 'PROCESSING',
      progress: 0,
      error: null,
    },
  });
  const doc = documentSchema.parse(task.snapshot);
  const output = await generatePdf(
    doc,
    async (id) => {
      const asset = await infra.db.imageAsset.findFirst({
        where: {
          id,
          bookId: task.bookId,
          userId: task.book.userId,
          status: 'READY',
        },
      });

      if (!asset) throw new Error('Image unavailable');
      return infra.get(asset.originalKey);
    },
    async (progress) => {
      await infra.db.exportJob.update({ where: { id: task.id }, data: { progress } });
      await job.updateProgress(progress);
    },
  );
  const key = `users/${task.book.userId}/books/${task.bookId}/exports/${task.id}.pdf`;

  await infra.put(key, output, 'application/pdf');
  await infra.db.exportJob.update({
    where: { id: task.id },
    data: {
      status: 'READY',
      objectKey: key,
      progress: 100,
      error: null,
    },
  });
}

const imageWorker = new Worker<{
  id: string;
}>('images', image, { connection: infra.redis, concurrency: 2 });
const pdfWorker = new Worker<{
  id: string;
}>('pdfs', pdf, { connection: infra.redis, concurrency: 1 });

for (const [worker, type] of [
  [imageWorker, 'image'],
  [pdfWorker, 'pdf'],
] as const) {
  worker.on('error', (err) => log.error({ err, type }, 'Worker error'));
  worker.on('failed', (job, error) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);

    log.error(
      {
        err: error,
        jobId: job.id,
        type,
        exhausted,
      },
      'Job attempt failed',
    );
    const data = {
      status: exhausted ? 'FAILED' : 'QUEUED',
      error: exhausted
        ? 'Processing failed after retries. Please retry or use another image.'
        : null,
    };

    void (
      type === 'image'
        ? infra.db.imageAsset.updateMany({
            where: { id: job.data.id, status: { not: 'READY' } },
            data,
          })
        : infra.db.exportJob.updateMany({
            where: { id: job.data.id, status: { not: 'READY' } },
            data,
          })
    ).catch((err) => log.error({ err }, 'Failed to persist failure'));
  });
}
let reconciling = false;

async function reconcile() {
  if (reconciling) return;
  reconciling = true;
  try {
    const [images, exports] = await Promise.all([
      infra.db.imageAsset.findMany({
        where: { status: { in: ['QUEUED', 'PROCESSING'] } },
        take: 100,
      }),
      infra.db.exportJob.findMany({
        where: { status: { in: ['QUEUED', 'PROCESSING'] } },
        take: 100,
      }),
    ]);

    for (const record of images) {
      const job = await infra.imageQueue.getJob(record.id);

      if (job && (await job.isFailed()))
        await infra.db.imageAsset.updateMany({
          where: { id: record.id, status: { in: ['QUEUED', 'PROCESSING'] } },
          data: {
            status: 'FAILED',
            error: 'Image processing exhausted its retries. Please retry.',
          },
        });
      else
        await infra.imageQueue.add(
          'process',
          { id: record.id },
          { ...jobOptions, jobId: record.id },
        );
    }
    for (const record of exports) {
      const job = await infra.pdfQueue.getJob(record.id);

      if (job && (await job.isFailed()))
        await infra.db.exportJob.updateMany({
          where: { id: record.id, status: { in: ['QUEUED', 'PROCESSING'] } },
          data: { status: 'FAILED', error: 'PDF processing exhausted its retries. Please retry.' },
        });
      else
        await infra.pdfQueue.add('export', { id: record.id }, { ...jobOptions, jobId: record.id });
    }
  } catch (err) {
    log.error({ err }, 'Job reconciliation failed');
  } finally {
    reconciling = false;
  }
}

const timer = setInterval(() => {
  void reconcile();
  void infra.producerRedis
    .set('photoforge:worker:heartbeat', Date.now(), 'EX', 35)
    .catch((err) => log.error({ err }, 'Heartbeat failed'));
}, 10000);

void reconcile();
let closing = false;

async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await Promise.all([imageWorker.close(), pdfWorker.close()]);
  await infra.close();
}

for (const sig of ['SIGTERM', 'SIGINT'])
  process.once(sig, () => {
    void close().catch((err) => {
      log.error({ err });
      process.exitCode = 1;
    });
  });
log.info('PhotoForge image and PDF workers started');
