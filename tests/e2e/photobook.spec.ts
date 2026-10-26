import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('create, upload, customize, save, export and download a real PDF', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore the demo studio' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'Create a photobook', exact: true }).first().click();
  await page.getByRole('button', { name: /Somewhere, together/ }).click();
  await page.getByLabel('Photobook title').fill('A real memory');
  await page.getByRole('button', { name: 'Start creating' }).click();
  await expect(page).toHaveURL(/editor/);
  const png = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: '#abc7ae',
    },
  })
    .png()
    .toBuffer();

  await page.locator('input[type=file]').setInputFiles({
    name: 'memory.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByRole('button', { name: 'Add memory.png', exact: true }).click({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Remove selected element' })).toBeVisible();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add a heading' }).click();
  await page.getByLabel('Your words').fill('Our wonderful adventure');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Photobook title' })).toHaveValue('A real memory');
  await page.getByRole('button', { name: 'Our wonderful adventure', exact: true }).click();
  await expect(page.getByLabel('Your words')).toHaveValue('Our wonderful adventure');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page).toHaveURL(/exports/);
  const download = page.getByRole('link', { name: 'Download your PDF' });

  await expect(download).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: 'test-results/export.png', fullPage: true });
  const url = await download.getAttribute('href');

  expect(url).toBeTruthy();
  const result = await request.get(url!);

  expect(result.ok()).toBe(true);
  expect((await result.body()).subarray(0, 4).toString()).toBe('%PDF');
});
