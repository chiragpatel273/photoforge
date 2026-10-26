'use client';

import { ErrorMessage } from '@/components/ui';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container error-page">
      <h1>A small pause in the story.</h1>
      <ErrorMessage message="This page couldn’t load. Please try again." />
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
