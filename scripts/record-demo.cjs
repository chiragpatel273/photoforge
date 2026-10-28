const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

if (!existsSync(chromium.executablePath())) {
  console.error('Chromium is not installed. Run: pnpm exec playwright install chromium');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const output = path.join(
  root,
  'test-results',
  'demo',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
mkdirSync(output, { recursive: true });
const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', '--config', 'demo.playwright.config.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DEMO_RUN_DIR: output },
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
function findVideo(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findVideo(file);
      if (found) return found;
    } else if (entry.name.endsWith('.webm')) return file;
  }
}
const video = findVideo(output);
if (video) {
  const passed = result.status === 0;
  const target = path.join(
    output,
    passed ? 'photoforge-demo.webm' : 'photoforge-demo.partial.webm',
  );
  copyFileSync(video, target);
  console.log(
    `\n${passed ? 'Completed recording' : 'Partial recording; workflow failed'}: ${target}`,
  );
  if (passed) {
    const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (ffmpeg.status === 0) {
      const mp4 = path.join(output, 'photoforge-demo.mp4');
      const converted = spawnSync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          target,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-an',
          mp4,
        ],
        { stdio: 'inherit' },
      );
      if (converted.status === 0) console.log(`MP4: ${mp4}`);
      else console.warn('MP4 conversion failed; the WebM recording is available.');
    } else console.log('Install ffmpeg for automatic MP4 conversion; WebM is ready.');
  }
}
process.exit(result.status ?? 1);
