const { Redis } = require('ioredis');
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });

redis
  .get('photoforge:worker:heartbeat')
  .then((v) => {
    if (!v) process.exitCode = 1;
  })
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(() => redis.disconnect());
