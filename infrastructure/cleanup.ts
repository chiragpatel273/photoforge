import 'dotenv/config';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { envSchema, infrastructure } from '@photoforge/shared/server';

const env = envSchema.parse(process.env);
const infra = infrastructure(env);

async function main() {
  const users = await infra.db.user.findMany({
    where: { isGuest: true, expiresAt: { lt: new Date() } },
    take: 100,
  });

  for (const user of users) {
    let continuation: string | undefined;

    do {
      const result = await infra.s3.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET,
          Prefix: `users/${user.id}/`,
          ContinuationToken: continuation,
        }),
      );
      const objects = result.Contents?.flatMap((o) => (o.Key ? [{ Key: o.Key }] : [])) ?? [];

      if (objects.length) {
        const deleted = await infra.s3.send(
          new DeleteObjectsCommand({
            Bucket: env.S3_BUCKET,
            Delete: { Objects: objects, Quiet: true },
          }),
        );

        if (deleted.Errors?.length)
          throw new Error(
            'Unable to delete expired guest objects; retaining database record for retry',
          );
      }
      continuation = result.NextContinuationToken;
    } while (continuation);
    await infra.db.user.delete({ where: { id: user.id } });
  }
  console.log(`Removed ${users.length} expired guest workspaces`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => infra.close());
