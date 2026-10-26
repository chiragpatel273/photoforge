'use client';

import { useState, useRef, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Book, priceCents, ProductSize, sizes } from '@photoforge/shared';
import { Check, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import { api, post, money } from '@/lib/api';
import { Shell } from '@/components/shell';
import { SectionHead, BookArt, ErrorMessage, Spinner } from '@/components/ui';

function Checkout() {
  const search = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  const id = search.get('book');
  const key = useRef<string | null>(null);
  const [size, setSize] = useState<ProductSize>('square');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const book = useQuery({
    queryKey: ['checkout', id],
    queryFn: () =>
      api<
        Book & {
          templateId: string;
        }
      >(`/photobooks/${id}`),
    enabled: !!id,
  });

  async function checkout() {
    if (!book.data) return;
    setBusy(true);
    setError('');
    key.current ??= crypto.randomUUID();
    try {
      await post('/orders', {
        bookId: id,
        size,
        pageCount: book.data.document.pages.length,
        idempotencyKey: key.current,
      });
      await client.invalidateQueries({ queryKey: ['orders'] });
      router.push('/orders');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!id) return <ErrorMessage message="Choose a photobook from your workspace first." />;
  if (book.isPending) return <Spinner />;
  if (book.error || !book.data)
    return <ErrorMessage message={book.error?.message ?? 'Book unavailable'} />;
  const doc = book.data.document;
  const matching = doc.widthMm === sizes[size].widthMm && doc.heightMm === sizes[size].heightMm;

  return (
    <>
      <Link href={`/editor/${id}`} className="text-link">
        <ArrowLeft size={15} />
        Back to your book
      </Link>
      <SectionHead
        eyebrow="ONE STEP CLOSER TO YOUR BOOKSHELF"
        title="Made by you. Ready to keep."
        description="Review your book and explore our simulated checkout."
      />
      <div className="checkout-grid">
        <div>
          <BookArt template={book.data.templateId} title={book.data.title} />
          <div className="checkout-options">
            <h3>Choose your format</h3>
            {(Object.keys(sizes) as ProductSize[]).map((k) => (
              <button
                className={`format-option ${size === k ? 'selected' : ''}`}
                key={k}
                onClick={() => {
                  setSize(k);
                  key.current = null;
                }}
              >
                <span className="radio-dot" />
                <div>
                  <strong>{k.charAt(0).toUpperCase() + k.slice(1)}</strong>
                  <small>
                    {sizes[k].widthMm} × {sizes[k].heightMm} mm
                  </small>
                </div>
                <span>From {money(priceCents(k, 20))}</span>
              </button>
            ))}
            <p className="small-text muted">
              {doc.pages.length} pages from your saved book. Add or remove pages in the editor
              before ordering.
            </p>
            {!matching && (
              <ErrorMessage message="This format differs from your page dimensions. Change dimensions in the editor’s Background panel, or select the matching format." />
            )}
          </div>
        </div>
        <aside className="order-summary">
          <div className="eyebrow">A LITTLE RECAP</div>
          <h2>Your order summary</h2>
          <h3>{book.data.title}</h3>
          <p className="muted">
            {doc.pages.length} pages · {doc.widthMm} × {doc.heightMm} mm
          </p>
          <div className="summary-line">
            <span>{size} photobook</span>
            <strong>{money(priceCents(size, Math.min(doc.pages.length, 20)))}</strong>
          </div>
          <div className="summary-line">
            <span>Additional pages ({Math.max(0, doc.pages.length - 20)})</span>
            <span>{money(Math.max(0, doc.pages.length - 20) * 125)}</span>
          </div>
          <div className="summary-line">
            <span>Shipping & tax</span>
            <span>Not applicable</span>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(priceCents(size, doc.pages.length))}</strong>
          </div>
          <div className="mock-note">
            <ShieldCheck size={22} />
            <div>
              <strong>A safe practice checkout.</strong>
              <p>
                No payment details, no charges, and no physical shipment. This creates a demo order
                record.
              </p>
            </div>
          </div>
          {error && <ErrorMessage message={error} />}
          <button
            className="btn primary full"
            disabled={busy || !matching}
            onClick={() => void checkout()}
          >
            {busy ? 'Creating your order…' : 'Place mock order'}
            <ArrowRight size={17} />
          </button>
          <span className="checkout-secure">
            <Check size={13} />
            Your photobook stays saved in your workspace.
          </span>
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <Suspense fallback={<Spinner />}>
        <Checkout />
      </Suspense>
    </Shell>
  );
}
