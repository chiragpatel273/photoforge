'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Download, Check, BookOpen, ArrowLeft, LoaderCircle, AlertTriangle } from 'lucide-react';
import { api, post } from '@/lib/api';
import { Shell } from './shell';
import { ErrorMessage, Spinner } from './ui';

type Export = {
  id: string;
  bookId: string;
  status: string;
  progress: number;
  error: string | null;
  downloadUrl?: string;
};

export function ExportPage({ id }: { id: string }) {
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['export', id],
    queryFn: () => api<Export>(`/exports/${id}`),
    refetchInterval: (q) =>
      ['READY', 'FAILED'].includes(q.state.data?.status ?? '') ? false : 1500,
  });
  const job = query.data;

  return (
    <Shell>
      <div className="export-container">
        {query.isPending ? (
          <Spinner label="Finding your export…" />
        ) : query.error ? (
          <ErrorMessage message={query.error.message} />
        ) : (
          job && (
            <>
              <span className={`export-icon ${job.status === 'FAILED' ? 'failed' : ''}`}>
                {job.status === 'READY' ? (
                  <Check size={35} />
                ) : job.status === 'FAILED' ? (
                  <AlertTriangle size={35} />
                ) : (
                  <BookOpen size={35} />
                )}
              </span>
              <div className="eyebrow">SOMETHING WORTH KEEPING</div>
              <h1>
                {job.status === 'READY'
                  ? 'Your story, ready to keep.'
                  : job.status === 'FAILED'
                    ? 'A small pause in the story.'
                    : 'Putting the finishing touches on.'}
              </h1>
              <p className="muted">
                {job.status === 'READY'
                  ? 'Your photobook is ready. Download it, share it, treasure it.'
                  : job.status === 'FAILED'
                    ? 'The export could not finish. Your saved photobook is safe.'
                    : 'We’re assembling your pages and preparing your PDF in the background.'}
              </p>
              {!['READY', 'FAILED'].includes(job.status) && (
                <>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="PDF export progress"
                    aria-valuenow={job.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${Math.max(3, job.progress)}%` }} />
                  </div>
                  <p className="progress-label">
                    <LoaderCircle size={15} className="spin" />
                    {job.status === 'QUEUED'
                      ? 'Waiting for a worker'
                      : `Preparing pages · ${job.progress}%`}
                  </p>
                </>
              )}
              {job.status === 'READY' && job.downloadUrl && (
                <a className="btn primary large" href={job.downloadUrl}>
                  <Download size={18} />
                  Download your PDF
                </a>
              )}
              {job.status === 'FAILED' && (
                <>
                  <ErrorMessage message={job.error ?? 'Export failed'} />
                  <button
                    className="btn primary"
                    onClick={async () => {
                      try {
                        await post(`/photobooks/${job.bookId}/exports`);
                        await query.refetch();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Try export again
                  </button>
                </>
              )}
              {error && <ErrorMessage message={error} />}
              <div className="export-specs">
                <span>
                  <Check size={15} />
                  Original-resolution photos
                </span>
                <span>
                  <Check size={15} />
                  Bleed & trim boxes
                </span>
                <span>
                  <Check size={15} />
                  Secure 15-minute download link
                </span>
              </div>
              <p className="print-disclaimer">
                Output uses RGB images and standard PDF fonts. CMYK conversion, ICC profiles, PDF/X
                validation, and printer certification are not included. Confirm requirements with
                your print provider.
              </p>
              <Link href={`/editor/${job.bookId}`} className="text-link">
                <ArrowLeft size={16} />
                Back to your book
              </Link>
            </>
          )
        )}
      </div>
    </Shell>
  );
}
