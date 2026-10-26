import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { emptyDocument } from '../packages/shared/src';
import { processImage } from '../apps/worker/src/images';
import { generatePdf } from '../apps/worker/src/pdf';

test('processing validates real image bytes and emits smaller WebP thumbnails', async () => {
  const input = await sharp({
    create: {
      width: 1000,
      height: 500,
      channels: 3,
      background: '#abcdef',
    },
  })
    .png()
    .toBuffer();
  const result = await processImage(input, 'image/png');

  expect(result.width).toBe(1000);
  expect((await sharp(result.thumbnail).metadata()).width).toBe(360);
  await expect(processImage(input, 'image/jpeg')).rejects.toThrow('Invalid');
  await expect(processImage(Buffer.from('fake'), 'image/png')).rejects.toThrow();
});

test('PDF embeds photos, text and physical bleed/trim boxes', async () => {
  const doc = emptyDocument();

  doc.pages[0]!.elements = [
    {
      id: crypto.randomUUID(),
      type: 'image',
      assetId: crypto.randomUUID(),
      x: 100,
      y: 100,
      width: 500,
      height: 500,
      rotation: 15,
      crop: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    },
    {
      id: crypto.randomUUID(),
      type: 'text',
      x: 50,
      y: 700,
      width: 900,
      height: 200,
      rotation: 0,
      text: 'A memory worth keeping',
      fontSize: 40,
      fontFamily: 'Helvetica',
      color: '#123456',
      align: 'center',
    },
  ];
  const image = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: 'red',
    },
  })
    .jpeg()
    .toBuffer();
  const progress: number[] = [];
  const bytes = await generatePdf(
    doc,
    async () => image,
    async (p) => {
      progress.push(p);
    },
  );
  const pdf = await PDFDocument.load(bytes);

  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo((216 * 72) / 25.4);
  expect(pdf.getPage(0).getTrimBox().width).toBeCloseTo((210 * 72) / 25.4);
  expect(progress).toEqual([95]);
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
});

test('missing export images cause a failure instead of a blank successful PDF', async () => {
  const d = emptyDocument();

  d.pages[0]!.elements.push({
    id: crypto.randomUUID(),
    type: 'image',
    assetId: crypto.randomUUID(),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    crop: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
  });
  await expect(
    generatePdf(d, async () => {
      throw new Error('not found');
    }),
  ).rejects.toThrow('not found');
});
