import { Prisma } from '@prisma/client';
import { BookDocument, referencedAssets } from '@photoforge/shared';
import { Infrastructure } from '@photoforge/shared/server';
import { HttpError, requireFound } from './errors';

export const json = (v: unknown) => v as Prisma.InputJsonValue;

export class BooksService {
  constructor(private infra: Infrastructure) {}
  async owned(id: string, userId: string) {
    return requireFound(await this.infra.db.photobook.findFirst({ where: { id, userId } }));
  }
  async validateAssets(document: BookDocument, userId: string, bookId: string) {
    const ids = referencedAssets(document);

    if (!ids.length) return;
    const count = await this.infra.db.imageAsset.count({
      where: {
        id: { in: ids },
        userId,
        bookId,
        status: 'READY',
      },
    });

    if (count !== ids.length)
      throw new HttpError(422, 'Every image must be processed and belong to this photobook');
  }
  async save(id: string, userId: string, title: string, revision: number, document: BookDocument) {
    await this.owned(id, userId);
    await this.validateAssets(document, userId, id);

    return this.infra.db.$transaction(async (tx) => {
      const updated = await tx.photobook.updateMany({
        where: {
          id,
          userId,
          revision,
        },
        data: {
          title,
          document: json(document),
          revision: { increment: 1 },
        },
      });

      if (updated.count !== 1)
        throw new HttpError(409, 'This book changed in another tab. Reload before saving.');
      await tx.photobookPage.deleteMany({ where: { bookId: id } });
      await tx.photobookPage.createMany({
        data: document.pages.map((p, position) => ({
          id: p.id,
          bookId: id,
          position,
          content: json(p),
        })),
      });

      return tx.photobook.findUniqueOrThrow({ where: { id } });
    });
  }
}
