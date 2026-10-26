import { z } from 'zod/v3';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().default(4000),
});

export type Environment = z.infer<typeof envSchema>;

export function infrastructure(env: Environment) {
  const db = new PrismaClient();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const producerRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  const config = {
    region: env.S3_REGION,
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    ...(env.S3_ACCESS_KEY && env.S3_SECRET_KEY
      ? {
          credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
        }
      : {}),
  };
  const s3 = new S3Client({ ...config, endpoint: env.S3_ENDPOINT });
  const signer = new S3Client({ ...config, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
  const imageQueue = new Queue('images', { connection: producerRedis });
  const pdfQueue = new Queue('pdfs', { connection: producerRedis });

  return {
    db,
    redis,
    producerRedis,
    imageQueue,
    pdfQueue,
    s3,
    async put(key: string, body: Uint8Array, mime: string) {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: mime,
          ...(!env.S3_ENDPOINT ? { ServerSideEncryption: 'AES256' as const } : {}),
        }),
      );
    },
    async get(key: string) {
      const object = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));

      if (!object.Body) throw new Error('Object body missing');
      return Buffer.from(await object.Body.transformToByteArray());
    },
    head: (key: string) => s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key })),
    uploadUrl: (key: string, mime: string, size: number) =>
      getSignedUrl(
        signer,
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          ContentType: mime,
          ContentLength: size,
        }),
        { expiresIn: 300 },
      ),
    downloadUrl: (key: string, filename?: string) =>
      getSignedUrl(
        signer,
        new GetObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename}"` } : {}),
        }),
        { expiresIn: 900 },
      ),
    async close() {
      await Promise.all([imageQueue.close(), pdfQueue.close()]);
      await Promise.all([db.$disconnect(), redis.quit(), producerRedis.quit()]);
      s3.destroy();
      signer.destroy();
    },
  };
}

export type Infrastructure = ReturnType<typeof infrastructure>;
