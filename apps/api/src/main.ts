import 'dotenv/config';
import { envSchema, infrastructure } from '@photoforge/shared/server';
import { buildApp } from './app';

async function main() {
  const env = envSchema.parse(process.env);
  const infra = infrastructure(env);
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  try {
    app = await buildApp(infra, env);

    app.addHook('onClose', () => infra.close());
    const server = app;

    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        void server.close().catch((e) => {
          server.log.error(e);
          process.exitCode = 1;
        });
      });
    await app.listen({ host: '0.0.0.0', port: env.PORT });
  } catch (error) {
    // Open Redis connections would otherwise keep a failed startup alive
    // without a listening HTTP server, leaving only an unhealthy container.
    try {
      if (app) await app.close();
      else await infra.close();
    } catch (cleanupError) {
      console.error('API startup cleanup failed', cleanupError);
    }
    throw error;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
