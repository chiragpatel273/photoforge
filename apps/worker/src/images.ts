import sharp from 'sharp';

sharp.concurrency(1);
sharp.cache({
  memory: 64,
  files: 0,
  items: 20,
});
import { MAX_UPLOAD } from '@photoforge/shared';

export async function processImage(input: Buffer, declaredMime: string) {
  if (input.length > MAX_UPLOAD) throw new Error('Image exceeds 20 MB');
  const pipeline = sharp(input, { limitInputPixels: 60000000, failOn: 'error' });
  const meta = await pipeline.metadata();
  const expected: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  if (
    meta.format !== expected[declaredMime] ||
    !meta.width ||
    !meta.height ||
    (meta.pages ?? 1) > 1
  )
    throw new Error('Invalid or animated image');
  const rotated = await pipeline.rotate().toBuffer();
  const oriented = await sharp(rotated).metadata();
  const [optimized, thumbnail] = await Promise.all([
    sharp(rotated)
      .resize({
        width: 3200,
        height: 3200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer(),
    sharp(rotated).resize(360, 360, { fit: 'cover' }).webp({ quality: 78 }).toBuffer(),
  ]);

  return {
    original: rotated,
    optimized,
    thumbnail,
    width: oriented.width!,
    height: oriented.height!,
  };
}
