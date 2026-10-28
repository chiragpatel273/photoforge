# Record a PhotoForge demo video

The recorder operates the actual application through Playwright and captures its browser viewport at 1440 × 900. It adds explanatory captions during the recording. It does not generate simulated application screens, replace API responses or claim successful steps before their assertions pass. There is no narration or background music.

Run it on your development computer, not on the small EC2 host. The default target is `https://photoforge-chirag.duckdns.org`. The host must be online with working HTTPS, guest authentication, photo-storage HTTPS/CORS, image processing and PDF jobs.

## First recording

From the repository root, with Node.js 24 and the pinned pnpm version:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm demo:record
```

On Linux, if Chromium reports missing OS libraries, install its dependencies using `pnpm exec playwright install --with-deps chromium` on the development computer. The browser runs headlessly, so WSL does not need a desktop session.

The recording creates one new guest workspace, one two-page travel book, one small uploaded image, one PDF export and one mock order. It uses no existing member account, password or payment information. Guest expiry does not automatically remove stored files; normal cleanup policies still apply. Do not record repeatedly against a resource-constrained host without checking its free disk space.

## Use your own photograph

Without an input photo, the script creates a landscape illustration and uploads that real image. For a more photographic walkthrough, supply a non-sensitive JPEG, PNG or WebP that you have permission to show:

```bash
DEMO_PHOTO=/absolute/path/to/your-photo.jpg pnpm demo:record
```

The input is resized to at most 1600 × 1200 and converted to JPEG before uploading, keeping the sample small. The recorder's captions do not identify the generated illustration as a real photograph.

To record a local deployment instead:

```bash
DEMO_BASE_URL=http://localhost:3000 pnpm demo:record
```

## Video and supporting artifacts

Each run writes to its own timestamped directory under `test-results/demo/`, which is ignored by Git. A successful run contains:

- `photoforge-demo.webm`: the complete captioned browser recording.
- `photoforge-demo.mp4`: also generated when `ffmpeg` is installed and supports H.264 encoding.
- Nested run artifacts: editor/preview/export PNGs, `photoforge-demo.pdf` and `workflow.json`.

The video includes the application's actual waiting/processing time. It is not a performance benchmark. The PDF check confirms a downloaded file with the `%PDF` header; it does not validate print-production compliance.

If FFmpeg is not installed, WebM is still produced. For automatic MP4 conversion on an Ubuntu/WSL development computer:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
pnpm demo:record
```

Alternatively convert an existing recording without creating another guest project:

```bash
ffmpeg -i /path/to/photoforge-demo.webm \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an \
  /path/to/photoforge-demo.mp4
```

Review the full video and PDF before uploading them to GitHub or a video host. Uploading or publishing is a separate action. A failure keeps a file named `photoforge-demo.partial.webm` when a browser recording exists, along with a failure screenshot. It exits unsuccessfully and does not label that recording as a completed demo. Fix the underlying error before sharing it.

## Walkthrough

1. Landing page and guest sign-in.
2. Dashboard, template selection and book creation.
3. Actual upload and asynchronous image processing.
4. Image rotation, undo/redo and text/font editing.
5. Save, browser refresh and persistence assertions.
6. Multi-page preview.
7. Actual queued PDF generation and browser download.
8. Mock checkout and confirmed order history.

Captions explain the RGB/CMYK limitation and simulated checkout. The recorder leaves application source and styling unchanged; the caption is only a temporary DOM overlay in its isolated browser session.

## Verification status

The recording configuration, TypeScript and lint have been checked locally. The developer successfully ran the recorder against the live HTTPS application on October 28, 2026. Completed workflow metadata, passing run status, screenshots, a WebM video and downloaded PDFs are present in the local output directories; the PDF headers were checked. The current recorder uses captions without pointer or click overlays. A fresh run is needed to capture subsequent application or recorder changes.

The coding-agent sandbox still cannot launch Chromium or connect to the live host, so browser recording is run from the developer's terminal. Successful recording does not substitute for load testing, certificate-renewal testing or print-production validation. The video has not been published to a public hosting service by the coding agent.

## Diagnosing a recording timeout

The recorder prints `[demo]` chapter names as it progresses. Ordinary actions have a 20-second timeout, navigation has a 45-second timeout, and the image/PDF worker waits have explicit longer limits. The whole recording is bounded to six minutes to allow those waits plus readable captions. Inspect the failure screenshot and `error-context.md` in the timestamped output directory; a failed recording remains labeled as partial.

The font dropdown uses its accessible `combobox` role and name. An exact text-label selector can include nested option text and fail to match the word `Font`, even while the visible dropdown is present.
