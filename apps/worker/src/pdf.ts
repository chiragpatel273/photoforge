import { PDFDocument, StandardFonts, rgb, degrees, PDFFont } from 'pdf-lib';
import sharp from 'sharp';
import { BookDocument, Element } from '@photoforge/shared';

const mm = (n: number) => (n * 72) / 25.4;

function color(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const result: string[] = [];

  for (const paragraph of text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) {
    let line = '';

    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;

      if (line && font.widthOfTextAtSize(next, size) > width) {
        result.push(line);
        line = word;
      } else line = next;
    }
    result.push(line);
  }

  return result;
}

export async function generatePdf(
  doc: BookDocument,
  loadImage: (id: string) => Promise<Buffer>,
  progress: (n: number) => Promise<void> = async () => {},
) {
  const pdf = await PDFDocument.create();

  pdf.setTitle('PhotoForge photobook');
  pdf.setCreator('PhotoForge');
  pdf.setSubject('RGB photobook with bleed and trim boxes; no CMYK/ICC certification');
  const fonts = {
    Helvetica: await pdf.embedFont(StandardFonts.Helvetica),
    'Times-Roman': await pdf.embedFont(StandardFonts.TimesRoman),
    Courier: await pdf.embedFont(StandardFonts.Courier),
  };
  const w = mm(doc.widthMm);
  const h = mm(doc.heightMm);
  const bleed = mm(doc.bleedMm);
  const scale = w / 1000;

  for (let i = 0; i < doc.pages.length; i++) {
    const page = pdf.addPage([w + 2 * bleed, h + 2 * bleed]);

    page.setTrimBox(bleed, bleed, w, h);
    page.setBleedBox(0, 0, w + 2 * bleed, h + 2 * bleed);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: w + 2 * bleed,
      height: h + 2 * bleed,
      color: color(doc.pages[i]!.background),
    });
    for (const el of doc.pages[i]!.elements) {
      const x = bleed + el.x * scale;
      const y = h + bleed - el.y * scale;
      const ew = el.width * scale;
      const eh = el.height * scale;
      const angle = (-el.rotation * Math.PI) / 180;
      const point = (dx: number, dy: number) => ({
        x: x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: y + dx * Math.sin(angle) + dy * Math.cos(angle),
      });

      if (el.type === 'image') {
        const source = await sharp(await loadImage(el.assetId))
          .rotate()
          .toBuffer();
        const metadata = await sharp(source).metadata();

        if (!metadata.width || !metadata.height) throw new Error('Image dimensions missing');
        const left = Math.min(metadata.width - 1, Math.floor(el.crop.x * metadata.width));
        const top = Math.min(metadata.height - 1, Math.floor(el.crop.y * metadata.height));
        const bytes = await sharp(source)
          .extract({
            left,
            top,
            width: Math.max(
              1,
              Math.min(metadata.width - left, Math.round(el.crop.width * metadata.width)),
            ),
            height: Math.max(
              1,
              Math.min(metadata.height - top, Math.round(el.crop.height * metadata.height)),
            ),
          })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 95 })
          .toBuffer();
        const image = await pdf.embedJpg(bytes);

        page.drawImage(image, {
          ...point(0, -eh),
          width: ew,
          height: eh,
          rotate: degrees(-el.rotation),
        });
      } else if (el.type === 'text') {
        const font = fonts[el.fontFamily];
        const size = el.fontSize * scale;
        const lines = wrap(el.text, font, size, ew);
        let baseline = -size;

        for (const line of lines) {
          if (-baseline > eh) break;
          const lineW = font.widthOfTextAtSize(line, size);
          const dx =
            el.align === 'center' ? (ew - lineW) / 2 : el.align === 'right' ? ew - lineW : 0;

          page.drawText(line, {
            ...point(dx, baseline),
            size,
            font,
            color: color(el.color),
            rotate: degrees(-el.rotation),
          });
          baseline -= size * 1.2;
        }
      }
    }
    await progress(Math.round(((i + 1) / doc.pages.length) * 95));
  }

  return Buffer.from(await pdf.save());
}

export function imageIds(elements: Element[]) {
  return elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : []));
}
