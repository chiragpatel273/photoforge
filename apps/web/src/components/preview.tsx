'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Book, Asset } from '@photoforge/shared';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ShoppingBag } from 'lucide-react';
import { api, post } from '@/lib/api';
import { Logo, Spinner, ErrorMessage } from './ui';

const Canvas = dynamic(() => import('./canvas'), { ssr: false });

export function Preview({ id }: { id: string }) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const book = useQuery({
    queryKey: ['preview', id],
    queryFn: () => api<Book>(`/photobooks/${id}`),
  });
  const assets = useQuery({
    queryKey: ['assets', id],
    queryFn: () => api<Asset[]>(`/photobooks/${id}/images`),
    refetchInterval: 600000,
  });

  async function exportPdf() {
    setBusy(true);
    try {
      const task = await post<{
        id: string;
      }>(`/photobooks/${id}/exports`);

      router.push(`/exports/${task.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (book.isPending) return <Spinner />;
  if (book.error || !book.data)
    return <ErrorMessage message={book.error?.message ?? 'Book unavailable'} />;
  return (
    <div className="preview-page">
      <header className="preview-header">
        <Logo />
        <Link href={`/editor/${id}`} className="text-link">
          <ArrowLeft size={16} />
          Back to editing
        </Link>
        <div>
          <Link href={`/orders/new?book=${id}`} className="btn secondary">
            <ShoppingBag size={16} />
            Order book
          </Link>
          <button disabled={busy} onClick={() => void exportPdf()} className="btn primary">
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </header>
      <div className="preview-title">
        <span className="eyebrow">THE MOMENTS, ALL TOGETHER</span>
        <h1>{book.data.title}</h1>
        <p className="muted">
          {book.data.document.widthMm} × {book.data.document.heightMm} mm ·{' '}
          {book.data.document.pages.length} pages
        </p>
      </div>
      {error && <ErrorMessage message={error} />}
      <div className="preview-canvas">
        <button
          className="icon-btn"
          disabled={page === 0}
          aria-label="Previous page"
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </button>
        <Canvas
          document={book.data.document}
          pageIndex={page}
          assets={assets.data ?? []}
          readOnly
        />
        <button
          className="icon-btn"
          disabled={page === book.data.document.pages.length - 1}
          aria-label="Next page"
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="preview-pagination">
        <button className="text-link" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          {page === 0 ? 'Front cover' : `Page ${page + 1}`}{' '}
          <small>/ {book.data.document.pages.length}</small>
        </span>
        <button
          className="text-link"
          disabled={page === book.data.document.pages.length - 1}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      <p className="center muted small-text">
        Preview shows the trim area. The PDF adds bleed around each page.
      </p>
    </div>
  );
}
