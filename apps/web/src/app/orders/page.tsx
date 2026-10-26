'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { api, money } from '@/lib/api';
import { Shell } from '@/components/shell';
import { SectionHead, ErrorMessage, Spinner } from '@/components/ui';

type Order = {
  id: string;
  totalCents: number;
  createdAt: string;
  items: {
    title: string;
    size: string;
    pageCount: number;
  }[];
};

export default function Page() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['orders', page],
    queryFn: () =>
      api<{
        items: Order[];
        total: number;
      }>(`/orders?page=${page}`),
  });

  return (
    <Shell>
      <SectionHead
        eyebrow="THE STORIES YOU’RE KEEPING"
        title="Your bookshelf, in the making."
        description="A record of your photobook orders. All checkouts are simulated; no payments or fulfillment."
      />
      {query.isPending ? (
        <Spinner />
      ) : query.error ? (
        <ErrorMessage message={query.error.message} />
      ) : !query.data?.items.length ? (
        <div className="orders-empty">
          <ShoppingBag size={44} />
          <h2>A story waiting to happen.</h2>
          <p className="muted">Create your book and try the mock checkout to see it here.</p>
          <Link href="/dashboard" className="btn primary">
            My photobooks <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className="order-table">
            <div className="order-row order-table-head">
              <span>YOUR PHOTOBOOK</span>
              <span>ORDERED</span>
              <span>STATUS</span>
              <span>TOTAL</span>
            </div>
            {query.data.items.map((o) => (
              <article key={o.id} className="order-row">
                <div>
                  <strong>{o.items[0]?.title}</strong>
                  <small>
                    {o.items[0]?.pageCount} pages · {o.items[0]?.size}
                    <br />
                    Order {o.id.slice(0, 8)}
                  </small>
                </div>
                <span>{new Date(o.createdAt).toLocaleDateString()}</span>
                <span className="order-status">
                  <Check size={13} />
                  Mock confirmed
                </span>
                <strong>{money(o.totalCents)}</strong>
              </article>
            ))}
          </div>
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
              disabled={page * 12 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}
