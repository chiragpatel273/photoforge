'use client';

import { useState, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { templates } from '@photoforge/shared';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { api, post, ApiError } from '@/lib/api';
import { Shell } from '@/components/shell';
import { BookArt, SectionHead, ErrorMessage, Spinner } from '@/components/ui';

type Template = {
  id: string;
  name: string;
  category: string;
};

function Gallery() {
  const router = useRouter();
  const client = useQueryClient();
  const search = useSearchParams();
  const [category, setCategory] = useState<string>(
    () => templates.find((t) => t.id === search.get('category'))?.category ?? 'All stories',
  );
  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/templates') });

  async function create() {
    setBusy(true);
    setError('');
    try {
      try {
        await api('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await post('/auth/demo');
          client.removeQueries({ queryKey: ['me'] });
        } else throw e;
      }
      const book = await post<{
        id: string;
      }>('/photobooks', { title, templateId: selected });

      await client.invalidateQueries({ queryKey: ['books'] });
      router.push(`/editor/${book.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHead
        eyebrow="A STARTING POINT FOR SOMETHING SPECIAL"
        title="Every story has a style."
        description="Thoughtfully designed. Endlessly personal. Find a template and make it yours."
      />
      <div className="template-filter">
        {['All stories', 'Travel', 'Wedding', 'Family', 'Birthday', 'Minimal'].map((c) => (
          <button
            className={category === c ? 'selected' : ''}
            onClick={() => setCategory(c)}
            key={c}
          >
            {c}
            {category === c && <Check size={13} />}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.error ? (
        <ErrorMessage message={query.error.message} />
      ) : (
        <div className="template-grid">
          {query.data
            ?.filter((t) => category === 'All stories' || category === t.category)
            .map((t) => (
              <button
                className="template-card"
                key={t.id}
                onClick={() => {
                  setSelected(t.id);
                  setTitle(t.name);
                }}
              >
                <BookArt template={t.id} />
                <div className="template-info">
                  <div>
                    <small>{t.category.toUpperCase()} COLLECTION</small>
                    <h3>{t.name}</h3>
                    <p>{templates.find((x) => x.id === t.id)?.description}</p>
                  </div>
                  <span className="round-arrow">
                    <Plus size={19} />
                  </span>
                </div>
              </button>
            ))}
        </div>
      )}
      <p className="center muted template-note">
        All templates include customizable layouts, text, colors, and as many pages as your story
        needs (up to 80).
      </p>
      {selected && (
        <div className="modal-backdrop" onClick={() => !busy && setSelected('')}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="eyebrow">LET’S MAKE IT PERSONAL</div>
            <h2 id="create-title">Give your story a name.</h2>
            <p className="muted">You can always change this later.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label>
                Photobook title
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              {error && <ErrorMessage message={error} />}
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="btn secondary"
                  onClick={() => setSelected('')}
                >
                  Cancel
                </button>
                <button disabled={busy || !title.trim()} className="btn primary">
                  {busy ? 'Creating…' : 'Start creating'}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <GalleryShell />
    </Suspense>
  );
}

function GalleryShell() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me'),
    retry: false,
  });

  if (query.isPending) return <Spinner />;
  return query.data ? (
    <Shell>
      <Gallery />
    </Shell>
  ) : (
    <div className="public-gallery">
      <a href="/" className="text-link">
        ← PhotoForge
      </a>
      <Gallery />
    </div>
  );
}
