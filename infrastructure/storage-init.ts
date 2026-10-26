import 'dotenv/config';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutPublicAccessBlockCommand,
} from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT;

if (!endpoint || !['localhost', 'minio', '127.0.0.1'].includes(new URL(endpoint).hostname))
  throw new Error('This initializer is for local S3 only. Configure AWS separately.');
const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

async function main() {
  const Bucket = process.env.S3_BUCKET!;
  let ready = false;

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket }));
      ready = true;
      break;
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket }));
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  if (!ready) throw new Error('Local S3 did not become ready');
  await s3
    .send(
      new PutPublicAccessBlockCommand({
        Bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    )
    .catch(() => {});
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => s3.destroy());
