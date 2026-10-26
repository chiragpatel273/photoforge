'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  Search,
  ArrowRight,
  Clock,
  BookOpen,
  Copy,
  Trash2,
  Pencil,
  LayoutGrid,
  List,
  Leaf,
} from 'lucide-react';
import { Book } from '@photoforge/shared';
import { api, post } from '@/lib/api';
import { Shell, User } from '@/components/shell';
import { SectionHead, Spinner, ErrorMessage, BookArt } from '@/components/ui';

type Item = Book & {
  templateId: string;
};

function Dashboard() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [error, setError] = useState('');
  const user = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') });
  const books = useQuery({
    queryKey: ['books', page, search],
    queryFn: ({ signal }) =>
      api<{
        items: Item[];
        total: number;
      }>(`/photobooks?page=${page}&q=${encodeURIComponent(search)}`, { signal }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/photobooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['books'] }),
    onError: (e) => setError(e.message),
  });

  async function duplicate(id: string) {
    try {
      await post(`/photobooks/${id}/duplicate`);
      await client.invalidateQueries({ queryKey: ['books'] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <SectionHead
        eyebrow="A HOME FOR YOUR MEMORIES"
        title={`A little creativity, ${
          user.data?.isGuest
            ? 'a lot of possibility'
            : (user.data?.name.split(' ')[0] ?? 'a lot of possibility')
        }.`}
        description="Your stories are waiting to be told. Let’s make something worth keeping."
      >
        <Link href="/templates" className="btn primary">
          <Plus size={18} />
          Create a photobook
        </Link>
      </SectionHead>
      <section className="dashboard-banner">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> YOUR NEXT CHAPTER STARTS HERE
          </div>
          <h2>
            Good moments.
            <br />
            <em>Great little books.</em>
          </h2>
          <p>
            Give your favourite photos a place in the real world.
            <br />
            Beautiful templates. Endless possibilities. All yours.
          </p>
          <Link href="/templates" className="btn dark">
            Find your starting point <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-books">
          <BookArt template="travel" />
          <BookArt template="family" />
        </div>
        <span className="banner-note">from your life, with love.</span>
      </section>
      <div className="books-heading">
        <div>
          <h2>
            Your photobooks <span className="count">{books.data?.total ?? 0}</span>
          </h2>
          <p className="muted">A work in progress is a memory in the making.</p>
        </div>
        <div className="books-tools">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search photobooks"
              placeholder="Find a photobook…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="view-switch">
            <button
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>
      {error && <ErrorMessage message={error} />}
      {books.isPending ? (
        <Spinner />
      ) : books.error ? (
        <ErrorMessage message={books.error.message} />
      ) : (
        <>
          <div className={`project-grid ${view === 'list' ? 'list-view' : ''}`}>
            {books.data?.items.map((book) => (
              <article className="project-card" key={book.id}>
                <Link href={`/editor/${book.id}`} aria-label={`Edit ${book.title}`}>
                  <BookArt template={book.templateId} title={book.title} />
                  <span className="draft-badge">In progress</span>
                </Link>
                <div className="project-details">
                  <div>
                    <Link href={`/editor/${book.id}`}>
                      <h3>{book.title}</h3>
                    </Link>
                    <p>
                      {book.document.pages.length} pages <span>·</span> {book.document.widthMm} ×{' '}
                      {book.document.heightMm} mm
                    </p>
                    <small>
                      <Clock size={12} />
                      Edited{' '}
                      {new Date(book.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </small>
                  </div>
                  <div className="project-actions">
                    <Link
                      className="icon-btn"
                      href={`/editor/${book.id}`}
                      aria-label={`Rename ${book.title}`}
                    >
                      <Pencil size={15} />
                    </Link>
                    <button
                      className="icon-btn"
                      onClick={() => void duplicate(book.id)}
                      aria-label={`Duplicate ${book.title}`}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete “${book.title}”? This cannot be undone.`))
                          remove.mutate(book.id);
                      }}
                      aria-label={`Delete ${book.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            <Link href="/templates" className="new-project">
              <span>
                <Plus size={25} />
              </span>
              <h3>
                {books.data?.total ? 'Another story to tell?' : 'Your first chapter starts here'}
              </h3>
              <p>
                Big adventures or everyday magic.
                <br />
                There’s a book waiting to happen.
              </p>
              <strong>
                Create a new photobook <ArrowRight size={15} />
              </strong>
            </Link>
          </div>
          {(books.data?.total ?? 0) > 12 && (
            <div className="pagination">
              <button
                className="btn secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="btn secondary"
                disabled={page * 12 >= (books.data?.total ?? 0)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      <div className="workspace-tip">
        <Leaf size={22} />
        <div>
          <strong>Made to be yours.</strong>
          <span>
            Every template is a starting point. Move things around, add your words, and make it feel
            like you.
          </span>
        </div>
        <Link href="/templates">
          Explore templates <ArrowRight size={15} />
        </Link>
      </div>
      <div className="dashboard-bottom">
        <BookOpen size={15} />
        <span>Your memories stay private. Your creativity is always yours.</span>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}
