'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Book,
  Asset,
  templates,
  templateDocument,
  documentSchema,
  resolutionDpi,
  MAX_UPLOAD,
  Element,
} from '@photoforge/shared';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Check,
  Eye,
  Download,
  Images,
  Type,
  Palette,
  PanelsTopLeft,
  Plus,
  Upload,
  Copy,
  Trash2,
  Minus,
  ArrowUp,
  ArrowDown,
  Save,
  AlertTriangle,
  ShoppingBag,
  LoaderCircle,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { useEditor } from '@/lib/editor-store';
import { Logo, Spinner, ErrorMessage } from './ui';

const Canvas = dynamic(() => import('./canvas'), {
  ssr: false,
  loading: () => <Spinner label="Opening the creative studio…" />,
});

export function Editor({ id }: { id: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const s = useEditor();
  const [tab, setTab] = useState('Photos');
  const [zoom, setZoom] = useState(0.85);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const inFlight = useRef<Promise<void> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const book = useQuery({
    queryKey: ['book', id],
    queryFn: () => api<Book>(`/photobooks/${id}`),
    retry: false,
  });
  const assets = useQuery({
    queryKey: ['assets', id],
    queryFn: () => api<Asset[]>(`/photobooks/${id}/images`),
    refetchInterval: (q) =>
      q.state.data?.some((a) => ['QUEUED', 'PROCESSING', 'UPLOADING'].includes(a.status))
        ? 2500
        : 600000,
  });

  useEffect(() => {
    if (book.data && useEditor.getState().bookId !== id) s.load(book.data);
  }, [book.data, id, s.load]);

  const save = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      setSaving(true);
      try {
        while (true) {
          const state = useEditor.getState();

          if (state.bookId !== id || !state.document || state.sequence === state.savedSequence)
            break;
          const document = documentSchema.parse(state.document);
          const sequence = state.sequence;
          const result = await api<Book>(`/photobooks/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              title: state.title,
              document,
              revision: state.revision,
            }),
          });

          if (useEditor.getState().bookId !== id) break;
          useEditor.getState().acknowledge(result.revision, sequence);
        }
        setError('');
        await client.invalidateQueries({ queryKey: ['books'] });
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setSaving(false);
        inFlight.current = null;
      }
    };

    inFlight.current = run();

    return inFlight.current;
  }, [id, client]);

  useEffect(() => {
    if (s.bookId !== id || s.sequence === s.savedSequence) return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 1200);

    return () => clearTimeout(timer);
  }, [s.sequence, s.bookId, id, save]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const state = useEditor.getState();

      if (state.sequence !== state.savedSequence) {
        e.preventDefault();
      }
    };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      const state = useEditor.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        state.remove();
      }
      if (e.key === 'Escape') state.select(null);
      if (state.selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const el = state.document?.pages[state.pageIndex]?.elements.find(
          (e) => e.id === state.selected,
        );

        if (el) {
          const step = e.shiftKey ? 10 : 1;

          state.patch(el.id, {
            x: el.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
            y: el.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
          });
        }
      }
    };

    window.addEventListener('beforeunload', before);
    window.addEventListener('keydown', key);

    return () => {
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('keydown', key);
    };
  }, []);

  function addImage(assetId: string, x = 100, y = 100) {
    const asset = assets.data?.find((a) => a.id === assetId && a.status === 'READY');

    if (!asset) return;
    const state = useEditor.getState();
    const current = state.document?.pages[state.pageIndex];
    const slot = current?.elements.find(
      (e) =>
        e.type === 'placeholder' &&
        x >= e.x &&
        y >= e.y &&
        x <= e.x + e.width &&
        y <= e.y + e.height,
    );
    const width = slot?.width ?? 800;
    const height =
      slot?.height ?? Math.min(750, (width * (asset.height ?? 1)) / (asset.width ?? 1));
    const imageRatio = (asset.width ?? 1) / (asset.height ?? 1);
    const boxRatio = width / height;
    const cropWidth = imageRatio > boxRatio ? boxRatio / imageRatio : 1;
    const cropHeight = imageRatio < boxRatio ? imageRatio / boxRatio : 1;
    const element: Element = {
      id: crypto.randomUUID(),
      type: 'image',
      assetId,
      x: slot?.x ?? Math.min(x, 900),
      y: slot?.y ?? Math.min(y, 900),
      width,
      height,
      rotation: slot?.rotation ?? 0,
      crop: {
        x: (1 - cropWidth) / 2,
        y: (1 - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
      },
    };

    if (slot) {
      state.change((d) => {
        d.pages[state.pageIndex]!.elements = d.pages[state.pageIndex]!.elements.map((e) =>
          e.id === slot.id ? element : e,
        );
      });
      state.select(element.id);
    } else state.add(element);
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError('');
    for (const file of Array.from(files)) {
      try {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > MAX_UPLOAD
        )
          throw new Error(`${file.name}: use a JPEG, PNG or WebP under 20 MB`);
        setUploadStatus(`Uploading ${file.name}…`);
        const response = await post<{
          asset: Asset;
          uploadUrl: string;
        }>(`/photobooks/${id}/images`, {
          filename: file.name,
          mime: file.type,
          size: file.size,
        });
        let uploaded = false;

        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await fetch(response.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
          }).catch(() => null);

          if (result?.ok) {
            uploaded = true;
            break;
          }
        }
        if (!uploaded)
          throw new Error(`${file.name}: upload failed. Please select the file to retry.`);
        await post(`/images/${response.asset.id}/complete`);
        await client.invalidateQueries({ queryKey: ['assets', id] });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setUploading(false);
    setUploadStatus('');
    if (input.current) input.current.value = '';
  }

  async function navigate(path: string) {
    try {
      await save();
      router.push(path);
    } catch {}
  }

  async function exportBook() {
    try {
      await save();
      const job = await post<{
        id: string;
      }>(`/photobooks/${id}/exports`);

      router.push(`/exports/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (book.error)
    return (
      <div className="container">
        <ErrorMessage message={book.error.message} />
        <Link href="/dashboard">Return to workspace</Link>
      </div>
    );
  if (book.isPending || s.bookId !== id) {
    return <Spinner />;
  }
  if (!s.document) return <Spinner />;
  const doc = s.document;
  const page = doc.pages[s.pageIndex]!;
  const selected = page.elements.find((e) => e.id === s.selected);
  const asset =
    selected?.type === 'image' ? assets.data?.find((a) => a.id === selected.assetId) : null;
  const dpi =
    selected?.type === 'image' && asset?.width
      ? resolutionDpi(asset.width * selected.crop.width, doc.widthMm, selected.width)
      : null;

  return (
    <div className="editor">
      <header className="editor-header">
        <button
          className="icon-btn"
          aria-label="Back to workspace"
          onClick={() => void navigate('/dashboard')}
        >
          <ArrowLeft size={20} />
        </button>
        <Logo />
        <span className="header-divider" />
        <div className="editor-title">
          <input
            aria-label="Photobook title"
            value={s.title}
            maxLength={120}
            onChange={(e) => s.rename(e.target.value)}
          />
          <small>
            {doc.widthMm} × {doc.heightMm} mm · {doc.pages.length} pages
          </small>
        </div>
        <div className="editor-top-actions">
          <span className="save-status">
            {saving ? (
              <>
                <LoaderCircle size={14} className="spin" />
                Saving…
              </>
            ) : s.savedSequence === s.sequence ? (
              <>
                <Check size={14} />
                All changes saved
              </>
            ) : (
              <>
                <span className="status-dot" />
                Unsaved changes
              </>
            )}
          </span>
          <button className="icon-btn" disabled={!s.past.length} onClick={s.undo} aria-label="Undo">
            <Undo2 size={18} />
          </button>
          <button
            className="icon-btn"
            disabled={!s.future.length}
            onClick={s.redo}
            aria-label="Redo"
          >
            <Redo2 size={18} />
          </button>
          <button className="btn secondary compact" onClick={() => void save().catch(() => {})}>
            <Save size={15} />
            Save
          </button>
          <button className="btn secondary compact" onClick={() => void navigate(`/preview/${id}`)}>
            <Eye size={16} />
            Preview
          </button>
          <button className="btn primary compact" onClick={() => void exportBook()}>
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </header>
      {error && (
        <div className="editor-error">
          <ErrorMessage message={error} />
          <button onClick={() => window.location.reload()} className="text-link">
            Reload saved version
          </button>
        </div>
      )}
      <div className="editor-body">
        <aside className="editor-left">
          <div className="editor-tabs">
            {[
              { name: 'Photos', icon: Images },
              { name: 'Templates', icon: PanelsTopLeft },
              { name: 'Text', icon: Type },
              { name: 'Background', icon: Palette },
            ].map((t) => (
              <button key={t.name} onClick={() => setTab(t.name)} aria-pressed={tab === t.name}>
                <t.icon size={20} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <div className="editor-assets">
            <h3>{tab === 'Photos' ? 'Your photos' : tab}</h3>
            {tab === 'Photos' ? (
              <>
                <p className="muted small-text">A little collection of your favourite moments.</p>
                <button
                  disabled={uploading}
                  className="btn primary full"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} />
                  {uploading ? 'Uploading…' : 'Upload photos'}
                </button>
                <input
                  ref={input}
                  className="sr-only"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void upload(e.target.files)}
                />
                <p className="upload-help">JPG, PNG, WebP · up to 20 MB each</p>
                {uploadStatus && (
                  <p role="status" className="small-text">
                    {uploadStatus}
                  </p>
                )}
                {assets.error && <ErrorMessage message={assets.error.message} />}
                <div className="asset-grid">
                  {assets.data?.map((a) => (
                    <div key={a.id} className="asset-tile">
                      {a.status === 'READY' && a.url ? (
                        <button
                          title={`Add ${a.filename}`}
                          aria-label={`Add ${a.filename}`}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData('application/photoforge-asset', a.id)
                          }
                          onClick={() => addImage(a.id)}
                        >
                          <img
                            loading="lazy"
                            decoding="async"
                            src={a.thumbnailUrl ?? a.url}
                            alt={a.filename}
                          />
                          <span>
                            <Plus size={15} />
                          </span>
                        </button>
                      ) : (
                        <div className="asset-processing">
                          <Images size={20} />
                          <small>
                            {a.status === 'FAILED'
                              ? 'Processing failed'
                              : a.status === 'UPLOADING'
                                ? 'Upload incomplete'
                                : 'Processing…'}
                          </small>
                          {['FAILED', 'UPLOADING'].includes(a.status) && (
                            <button
                              className="text-link"
                              onClick={async () => {
                                try {
                                  await post(`/images/${a.id}/complete`);
                                  await client.invalidateQueries({ queryKey: ['assets', id] });
                                } catch (e) {
                                  setError((e as Error).message);
                                }
                              }}
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {!assets.data?.length && !uploading && (
                  <div className="asset-empty">
                    <Images size={34} />
                    <strong>Make space for memories.</strong>
                    <p>Upload a few photos, then click or drag them onto your page.</p>
                  </div>
                )}
                <div className="editor-hint">
                  TIP
                  <span>
                    Drag a photo onto the page to add it. Select it to resize, rotate, or crop.
                  </span>
                </div>
              </>
            ) : tab === 'Text' ? (
              <>
                <p className="muted small-text">Some moments need a few words.</p>
                {[
                  {
                    label: 'Add a heading',
                    fontSize: 60,
                    fontFamily: 'Times-Roman' as const,
                  },
                  {
                    label: 'Add body text',
                    fontSize: 24,
                    fontFamily: 'Helvetica' as const,
                  },
                ].map((t) => (
                  <button
                    key={t.label}
                    className="text-preset"
                    onClick={() =>
                      s.add({
                        id: crypto.randomUUID(),
                        type: 'text',
                        text: t.label,
                        x: 120,
                        y: 160,
                        width: 760,
                        height: t.fontSize * 2,
                        rotation: 0,
                        fontSize: t.fontSize,
                        fontFamily: t.fontFamily,
                        color: '#26392e',
                        align: 'left',
                      })
                    }
                  >
                    {t.label}
                    <Plus size={16} />
                  </button>
                ))}
                <p className="upload-help">
                  PDF fonts: Helvetica, Times, Courier. Latin text is supported.
                </p>
              </>
            ) : tab === 'Background' ? (
              <>
                <p className="muted small-text">Set the mood for this page.</p>
                <div className="swatches">
                  {[
                    '#ffffff',
                    '#f6f1e9',
                    '#e7eddf',
                    '#efe5dc',
                    '#e6e2da',
                    '#f4e7d2',
                    '#26392e',
                    '#273f52',
                    '#ae765c',
                  ].map((c) => (
                    <button
                      key={c}
                      aria-label={`Use background ${c}`}
                      style={{ background: c }}
                      aria-pressed={page.background === c}
                      onClick={() =>
                        s.change((d) => {
                          d.pages[s.pageIndex]!.background = c;
                        })
                      }
                    />
                  ))}
                </div>
                <label>
                  Custom color
                  <input
                    type="color"
                    value={page.background}
                    onChange={(e) =>
                      s.change((d) => {
                        d.pages[s.pageIndex]!.background = e.target.value;
                      })
                    }
                  />
                </label>
                <h4>Book dimensions</h4>
                <div className="dimension-fields">
                  <label>
                    Width (mm)
                    <input
                      type="number"
                      min={100}
                      max={420}
                      value={doc.widthMm}
                      onChange={(e) =>
                        s.change((d) => {
                          d.widthMm = Math.min(420, Math.max(100, Number(e.target.value)));
                        })
                      }
                    />
                  </label>
                  <label>
                    Height (mm)
                    <input
                      type="number"
                      min={100}
                      max={420}
                      value={doc.heightMm}
                      onChange={(e) =>
                        s.change((d) => {
                          d.heightMm = Math.min(420, Math.max(100, Number(e.target.value)));
                        })
                      }
                    />
                  </label>
                  <label>
                    Bleed (mm)
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={doc.bleedMm}
                      onChange={(e) =>
                        s.change((d) => {
                          d.bleedMm = Math.min(5, Math.max(0, Number(e.target.value)));
                        })
                      }
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <p className="muted small-text">
                  Apply a fresh layout to this page. Photos on the page will be removed.
                </p>
                {templates.map((t) => (
                  <button
                    className="editor-template"
                    key={t.id}
                    style={{ background: t.color }}
                    onClick={() => {
                      if (
                        page.elements.length &&
                        !window.confirm('Replace this page layout? You can undo this change.')
                      )
                        return;
                      const next = templateDocument(t.id).pages[0]!;

                      s.change((d) => {
                        next.id = d.pages[s.pageIndex]!.id;
                        d.pages[s.pageIndex] = next;
                      });
                      s.select(null);
                    }}
                  >
                    <small>{t.category}</small>
                    <strong>{t.title}</strong>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>
        <main className="editor-center">
          <div className="canvas-toolbar">
            <span>
              Page {s.pageIndex + 1} <span className="muted">of {doc.pages.length}</span>
            </span>
            <div>
              <button
                className="icon-btn"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))}
              >
                <Minus size={15} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                className="icon-btn"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              >
                <Plus size={15} />
              </button>
              <button className="text-link" onClick={() => setZoom(0.85)}>
                Fit
              </button>
            </div>
          </div>
          <div className="canvas-scroll">
            <Canvas assets={assets.data ?? []} zoom={zoom} onDropAsset={addImage} />
          </div>
          <div className="canvas-caption">
            A little preview of something you’ll keep forever.
            <span>Dashed line = trim inset · background extends into bleed</span>
          </div>
          <div className="page-strip">
            <div className="page-strip-label">
              YOUR STORY <span>{doc.pages.length} pages</span>
            </div>
            <div className="page-thumbnails">
              {doc.pages.map((p, i) => (
                <button
                  aria-label={`Go to page ${i + 1}`}
                  aria-pressed={s.pageIndex === i}
                  key={p.id}
                  className="page-thumbnail"
                  onClick={() => s.page(i)}
                >
                  <span style={{ background: p.background }}>
                    {p.elements.some((e) => e.type === 'image') ? (
                      <Images size={22} />
                    ) : (
                      <span className="tiny-page-text">
                        {p.elements.find((e) => e.type === 'text')?.text.slice(0, 24) ??
                          'A new chapter'}
                      </span>
                    )}
                  </span>
                  <small>{i === 0 ? 'Cover' : `Page ${i + 1}`}</small>
                </button>
              ))}
              <button className="add-page" disabled={doc.pages.length >= 80} onClick={s.addPage}>
                <Plus size={22} />
                <small>Add page</small>
              </button>
            </div>
          </div>
        </main>
        <aside className="editor-right">
          <h3>{selected ? 'Make it yours' : 'The little details'}</h3>
          {selected ? (
            <>
              <div className="property-section">
                <div className="property-heading">
                  {selected.type === 'image'
                    ? 'PHOTO'
                    : selected.type === 'text'
                      ? 'TEXT'
                      : 'PHOTO SLOT'}
                  <button
                    className="icon-btn danger"
                    aria-label="Remove selected element"
                    onClick={s.remove}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {selected.type === 'text' && (
                  <>
                    <label>
                      Your words
                      <textarea
                        rows={4}
                        maxLength={2000}
                        value={selected.text}
                        onChange={(e) => s.patch(selected.id, { text: e.target.value })}
                      />
                    </label>
                    <label>
                      Font
                      <select
                        value={selected.fontFamily}
                        onChange={(e) =>
                          s.patch(selected.id, {
                            fontFamily: e.target.value as 'Helvetica' | 'Times-Roman' | 'Courier',
                          })
                        }
                      >
                        <option>Helvetica</option>
                        <option>Times-Roman</option>
                        <option>Courier</option>
                      </select>
                    </label>
                    <div className="property-grid">
                      <label>
                        Size
                        <input
                          type="number"
                          min={8}
                          max={180}
                          value={selected.fontSize}
                          onChange={(e) =>
                            s.patch(selected.id, { fontSize: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Color
                        <input
                          type="color"
                          value={selected.color}
                          onChange={(e) => s.patch(selected.id, { color: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Alignment
                      <select
                        value={selected.align}
                        onChange={(e) =>
                          s.patch(selected.id, {
                            align: e.target.value as 'left' | 'center' | 'right',
                          })
                        }
                      >
                        <option>left</option>
                        <option>center</option>
                        <option>right</option>
                      </select>
                    </label>
                  </>
                )}
                <div className="property-grid">
                  {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key) => (
                    <label key={key}>
                      {key}
                      <input
                        type="number"
                        value={Math.round(selected[key])}
                        onChange={(e) => s.patch(selected.id, { [key]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
                {selected.type === 'image' && (
                  <>
                    <h4>Crop your photo</h4>
                    <label>
                      Crop amount
                      <input
                        type="range"
                        min={0}
                        max={80}
                        value={Math.round((1 - selected.crop.width) * 100)}
                        onChange={(e) => {
                          const size = 1 - Number(e.target.value) / 100;

                          s.patch(selected.id, {
                            crop: {
                              x: Math.min(selected.crop.x, 1 - size),
                              y: Math.min(selected.crop.y, 1 - size),
                              width: size,
                              height: size,
                            },
                          });
                        }}
                      />
                    </label>
                    <label>
                      Horizontal position
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={
                          selected.crop.width === 1
                            ? 0
                            : (selected.crop.x / (1 - selected.crop.width)) * 100
                        }
                        onChange={(e) =>
                          s.patch(selected.id, {
                            crop: {
                              ...selected.crop,
                              x: (Number(e.target.value) / 100) * (1 - selected.crop.width),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Vertical position
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={
                          selected.crop.height === 1
                            ? 0
                            : (selected.crop.y / (1 - selected.crop.height)) * 100
                        }
                        onChange={(e) =>
                          s.patch(selected.id, {
                            crop: {
                              ...selected.crop,
                              y: (Number(e.target.value) / 100) * (1 - selected.crop.height),
                            },
                          })
                        }
                      />
                    </label>
                    <button
                      className="btn secondary full compact"
                      onClick={() =>
                        s.patch(selected.id, {
                          crop: {
                            x: 0,
                            y: 0,
                            width: 1,
                            height: 1,
                          },
                        })
                      }
                    >
                      Reset crop
                    </button>
                    {dpi !== null && dpi < 300 && (
                      <div className="resolution-warning">
                        <AlertTriangle size={17} />
                        <span>
                          About {Math.round(dpi)} DPI at this size. Aim for 300 DPI for sharper
                          prints.
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="layer-actions">
                  <button className="btn secondary compact" onClick={() => s.reorder(1)}>
                    <ArrowUp size={14} />
                    Forward
                  </button>
                  <button className="btn secondary compact" onClick={() => s.reorder(-1)}>
                    <ArrowDown size={14} />
                    Back
                  </button>
                </div>
                <button
                  className="btn secondary full compact"
                  onClick={() =>
                    s.add({
                      ...structuredClone(selected),
                      id: crypto.randomUUID(),
                      x: selected.x + 20,
                      y: selected.y + 20,
                    })
                  }
                >
                  <Copy size={14} />
                  Duplicate element
                </button>
              </div>
            </>
          ) : (
            <div className="property-empty">
              <PanelsTopLeft size={30} />
              <strong>Every detail tells a story.</strong>
              <p>Select a photo or text on the canvas to customize it.</p>
              <small>
                Drag to move · corners to resize
                <br />
                Handle to rotate · Delete to remove
              </small>
            </div>
          )}
          <div className="property-section">
            <div className="property-heading">
              PAGE {s.pageIndex + 1}
              <span>{page.elements.length} elements</span>
            </div>
            <div className="layer-list">
              {[...page.elements].reverse().map((el) => (
                <button
                  key={el.id}
                  aria-pressed={s.selected === el.id}
                  onClick={() => s.select(el.id)}
                >
                  {el.type === 'text' ? <Type size={14} /> : <Images size={14} />}
                  <span>
                    {el.type === 'text'
                      ? el.text.slice(0, 24)
                      : el.type === 'placeholder'
                        ? el.label
                        : (assets.data?.find((a) => a.id === el.assetId)?.filename ?? 'Photo')}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="btn secondary full compact"
              disabled={doc.pages.length >= 80}
              onClick={s.duplicatePage}
            >
              <Copy size={14} />
              Duplicate page
            </button>
            <button
              className="btn ghost full compact danger"
              disabled={doc.pages.length <= 1}
              onClick={s.removePage}
            >
              <Trash2 size={14} />
              Remove page
            </button>
          </div>
          <div className="editor-print-note">
            <Check size={18} />
            <div>
              Designed for the real world.
              <small>PDF includes {doc.bleedMm} mm bleed and trim boxes. RGB output.</small>
            </div>
          </div>
          <button
            className="btn secondary full"
            onClick={() => void navigate(`/orders/new?book=${id}`)}
          >
            <ShoppingBag size={15} />
            Order your book
          </button>
        </aside>
      </div>
    </div>
  );
}
