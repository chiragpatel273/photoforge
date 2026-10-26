import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const suite = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

suite('BullMQ retry and dead-letter semantics', () => {
  test('retries exhaust and retain the failed job for inspection', async () => {
    const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    const name = `test-${crypto.randomUUID()}`;
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    let attempts = 0;
    const worker = new Worker(
      name,
      async () => {
        attempts++;
        throw new Error('Deliberate transient failure');
      },
      { connection },
    );

    try {
      await events.waitUntilReady();
      const job = await queue.add(
        'test',
        {},
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10 },
          removeOnFail: false,
        },
      );

      await expect(job.waitUntilFinished(events, 10000)).rejects.toThrow('Deliberate');
      expect(attempts).toBe(3);
      expect(await job.getState()).toBe('failed');
      expect(await queue.getFailedCount()).toBe(1);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  });
});
