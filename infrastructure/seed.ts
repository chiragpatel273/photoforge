import { Redis } from 'ioredis';
import { PrismaClient, Prisma } from '@prisma/client';
import { templates, templateDocument } from '../packages/shared/src';

const db = new PrismaClient();

async function seed() {
  for (const t of templates)
    await db.template.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        name: t.name,
        category: t.category,
        document: templateDocument(t.id) as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: t.name,
        category: t.category,
        document: templateDocument(t.id) as unknown as Prisma.InputJsonValue,
      },
    });
}

seed()
  .then(async () => {
    if (process.env.REDIS_URL) {
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });

      try {
        await redis.del('templates:v1');
      } finally {
        redis.disconnect();
      }
    }
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
