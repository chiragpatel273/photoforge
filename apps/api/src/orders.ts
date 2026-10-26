import { Prisma, type PrismaClient } from '@prisma/client';
import {
  documentSchema,
  priceCents,
  sizes,
  type BookDocument,
  type OrderRequest,
} from '@photoforge/shared';
import type { BooksService } from './books';
import { json } from './books';
import { HttpError } from './errors';
import type { PaymentGateway } from './payments';

export type OrderRecord = Prisma.OrderGetPayload<{ include: { items: true } }>;

export type OrderDraft = {
  userId: string;
  idempotencyKey: string;
  status: 'MOCK_CONFIRMED';
  totalCents: number;
  bookId: string;
  title: string;
  size: OrderRequest['size'];
  pageCount: number;
  document: BookDocument;
};

export interface OrderRepository {
  findByKey: (key: string) => Promise<OrderRecord | null>;
  create: (draft: OrderDraft) => Promise<OrderRecord>;
}

export class OrderKeyConflict extends Error {
  constructor() {
    super('Order idempotency key already exists');
  }
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private db: PrismaClient) {}

  findByKey(key: string) {
    return this.db.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
  }

  async create(draft: OrderDraft) {
    try {
      return await this.db.order.create({
        data: {
          userId: draft.userId,
          idempotencyKey: draft.idempotencyKey,
          status: draft.status,
          totalCents: draft.totalCents,
          items: {
            create: {
              bookId: draft.bookId,
              title: draft.title,
              size: draft.size,
              pageCount: draft.pageCount,
              priceCents: draft.totalCents,
              document: json(draft.document),
            },
          },
        },
        include: { items: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new OrderKeyConflict();
      }
      throw error;
    }
  }
}

export class OrdersService {
  constructor(
    private orders: OrderRepository,
    private books: Pick<BooksService, 'owned'>,
    private payments: PaymentGateway,
  ) {}

  private replay(order: OrderRecord, userId: string, input: OrderRequest) {
    const item = order.items[0];
    if (
      order.userId !== userId ||
      order.items.length !== 1 ||
      item?.bookId !== input.bookId ||
      item.size !== input.size ||
      item.pageCount !== input.pageCount
    )
      throw new HttpError(409, 'Checkout key already used');
    return { order, created: false };
  }

  async checkout(userId: string, input: OrderRequest) {
    const existing = await this.orders.findByKey(input.idempotencyKey);
    if (existing) return this.replay(existing, userId, input);

    const book = await this.books.owned(input.bookId, userId);
    const doc = documentSchema.parse(book.document);
    if (doc.pages.length !== input.pageCount) {
      throw new HttpError(409, 'Page count changed. Refresh your order.');
    }
    const dimensions = sizes[input.size];
    if (doc.widthMm !== dimensions.widthMm || doc.heightMm !== dimensions.heightMm) {
      throw new HttpError(422, 'Select a size matching your book dimensions');
    }
    const totalCents = priceCents(input.size, input.pageCount);
    const payment = await this.payments.confirm({
      amountCents: totalCents,
      currency: 'USD',
      idempotencyKey: input.idempotencyKey,
    });

    try {
      const order = await this.orders.create({
        userId,
        idempotencyKey: input.idempotencyKey,
        status: payment.status,
        totalCents,
        bookId: book.id,
        title: book.title,
        size: input.size,
        pageCount: input.pageCount,
        document: doc,
      });
      return { order, created: true };
    } catch (error) {
      if (!(error instanceof OrderKeyConflict)) throw error;
      // Another request committed the same key after our initial lookup.
      // Read outside the failed INSERT transaction and recheck ownership and
      // request parameters before returning the winning order.
      const winner = await this.orders.findByKey(input.idempotencyKey);
      if (!winner) throw error;
      return this.replay(winner, userId, input);
    }
  }
}
