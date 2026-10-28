import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Deliberate reading pauses make this a recorded walkthrough, not a fast test.
async function chapter(page: Page, title: string, detail: string) {
  console.log(`[demo] ${title}`);
  await page.evaluate(
    ({ title, detail }) => {
      let caption = document.getElementById('photoforge-demo-caption');
      if (!caption) {
        caption = document.createElement('div');
        caption.id = 'photoforge-demo-caption';
        caption.style.cssText =
          'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:780px;width:max-content;padding:14px 24px;border-radius:16px;background:rgba(23,36,31,.94);color:white;text-align:center;font:15px/1.5 system-ui,sans-serif;box-shadow:0 8px 32px #0003;pointer-events:none';
        document.body.append(caption);
      }
      const heading = document.createElement('strong');
      heading.textContent = title;
      heading.style.cssText = 'display:block;font-size:18px;letter-spacing:.2px';
      const description = document.createElement('span');
      description.textContent = detail;
      description.style.opacity = '.85';
      caption.replaceChildren(heading, description);
    },
    { title, detail },
  );
  await page.waitForTimeout(2000);
}

async function sampleImage() {
  if (process.env.DEMO_PHOTO) {
    return sharp(await readFile(process.env.DEMO_PHOTO))
      .rotate()
      .resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
  // Original illustrated sample; no personal photos or third-party downloads.
  const landscape = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#a9cbd3"/><stop offset="1" stop-color="#f6dfbb"/></linearGradient></defs>
    <rect width="1600" height="1200" fill="url(#sky)"/><circle cx="1180" cy="300" r="115" fill="#fff1cc"/>
    <path d="M0 700 350 210 760 760 1090 380 1600 790V1200H0" fill="#8ca8a4"/>
    <path d="m350 210-110 155 110-45 105 70z" fill="#f0eee2"/><path d="m1090 380-100 125 100-35 95 53z" fill="#ebe9dd"/>
    <path d="M0 900 430 580 870 940 1330 610 1600 830V1200H0" fill="#496d65"/>
    <path d="M0 960Q400 810 800 1000T1600 960V1200H0" fill="#bacdba"/>
    <path d="M500 1200 830 940 900 950 760 1200" fill="#e9cfa6"/>
  </svg>`;
  return sharp(Buffer.from(landscape)).jpeg({ quality: 88 }).toBuffer();
}

test('record the real guest-to-PDF PhotoForge workflow', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await chapter(
    page,
    'PhotoForge',
    'A photobook studio built with React, Node.js and background workers.',
  );
  await page.getByRole('link', { name: 'Take a look around' }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 45000 });
  await chapter(
    page,
    'Explore without registration',
    'A real guest workspace with private projects and database persistence.',
  );
  await page.getByRole('link', { name: 'Create a photobook', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Somewhere, together/ })).toBeVisible();
  await chapter(
    page,
    'Choose a starting point',
    'Editable travel, wedding, family, birthday and minimal templates.',
  );
  await page.getByRole('button', { name: /Somewhere, together/ }).click();
  await page.getByLabel('Photobook title').fill('Our next adventure');
  await page.getByRole('button', { name: 'Start creating' }).click();
  await expect(page).toHaveURL(/editor/, { timeout: 45000 });
  const editorUrl = page.url();
  const bookId = new URL(editorUrl).pathname.split('/').pop();
  expect(bookId).toBeTruthy();
  await expect(page.locator('canvas').first()).toBeVisible();
  await chapter(
    page,
    'Your canvas, your story',
    'A Konva editor with editable pages, text, photos and layout properties.',
  );
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'adventure.jpg', mimeType: 'image/jpeg', buffer: await sampleImage() });
  await chapter(
    page,
    'Upload and process an image',
    'The real background image worker prepares the uploaded image.',
  );
  await page
    .getByRole('button', { name: 'Add adventure.jpg', exact: true })
    .click({ timeout: 90000 });
  await expect(page.getByRole('button', { name: 'Remove selected element' })).toBeVisible();
  await chapter(
    page,
    'Customize the layout',
    'Place images on the canvas and adjust their position and rotation.',
  );
  await page.getByLabel('rotation', { exact: true }).fill('4');
  await page.getByLabel('rotation', { exact: true }).press('Tab');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add a heading' }).click();
  await page.getByLabel('Your words').fill('The places we remember');
  const font = page.getByRole('combobox', { name: 'Font', exact: true });
  await expect(font).toBeVisible();
  await font.selectOption('Helvetica');
  await expect(font).toHaveValue('Helvetica');
  await chapter(
    page,
    'Make it personal',
    'Add a heading, choose a font, and use undo or redo while editing.',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.screenshot({ path: info.outputPath('editor.png') });
  await chapter(
    page,
    'Saved beyond this browser session',
    'Refresh the page to check that the saved project is restored.',
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Photobook title' })).toHaveValue(
    'Our next adventure',
  );
  await page.getByRole('button', { name: 'The places we remember', exact: true }).click();
  await expect(page.getByLabel('Your words')).toHaveValue('The places we remember');
  await chapter(
    page,
    'Persistence verified',
    'The book title and edited heading survived a full page refresh.',
  );
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page).toHaveURL(/preview/);
  await expect(page.locator('canvas').first()).toBeVisible();
  await chapter(page, 'Preview before exporting', 'Review the book pages before requesting a PDF.');
  await page.screenshot({ path: info.outputPath('preview.png') });
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page).toHaveURL(/exports/);
  await chapter(
    page,
    'PDF generation runs in the background',
    'Wait for the actual export worker; processing time varies on the demo server.',
  );
  const link = page.getByRole('link', { name: 'Download your PDF' });
  await expect(link).toBeVisible({ timeout: 120000 });
  await chapter(
    page,
    'Download the finished photobook',
    'RGB PDF output with bleed and trim boxes; no CMYK or ICC certification claim.',
  );
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const pdfPath = info.outputPath('photoforge-demo.pdf');
  await download.saveAs(pdfPath);
  expect((await readFile(pdfPath)).subarray(0, 4).toString()).toBe('%PDF');
  await page.screenshot({ path: info.outputPath('export.png') });
  await page.goto(`/orders/new?book=${bookId}`);
  await expect(page.getByRole('button', { name: 'Place mock order' })).toBeEnabled();
  await chapter(
    page,
    'A safe practice checkout',
    'Server-calculated pricing and order records. No real payments or shipping.',
  );
  await page.getByRole('button', { name: 'Place mock order' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByText('Mock confirmed', { exact: true })).toBeVisible();
  await chapter(
    page,
    'From a blank book to a downloadable PDF',
    'PhotoForge • React / Next.js • Fastify • PostgreSQL • Redis / BullMQ • AWS EC2',
  );
  await page.waitForTimeout(4000);
  await writeFile(
    info.outputPath('workflow.json'),
    JSON.stringify(
      {
        baseURL: new URL(editorUrl).origin,
        completedAt: new Date().toISOString(),
        verified: [
          'guest sign-in',
          'create book',
          'image processing',
          'canvas editing',
          'save and reload',
          'preview',
          'PDF download header',
          'mock order',
        ],
        sampleImage: process.env.DEMO_PHOTO
          ? 'user-supplied image'
          : 'generated landscape illustration',
      },
      null,
      2,
    ),
  );
});
