'use client';

import Link from 'next/link';
import { BookOpen, ArrowUpRight, LoaderCircle, AlertCircle } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="PhotoForge home">
      <span className="logo-mark">
        <BookOpen size={22} />
      </span>
      photo<span className="logo-light">forge</span>
      <span className="logo-dot">.</span>
    </Link>
  );
}

export function Spinner({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      {label}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div role="alert" className="error">
      <AlertCircle size={17} />
      {message}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

const photos: Record<string, string> = {
  travel: 'photo-1476514525535-07fb3b4ae5f1',
  wedding: 'photo-1519741497674-611481863552',
  family: 'photo-1511895426328-dc8714191300',
  birthday: 'photo-1464349095431-e9a21285b5f3',
  minimal: 'photo-1441974231531-c6227db76b6e',
};

export function BookArt({
  template = 'travel',
  title,
  small = false,
}: {
  template?: string;
  title?: string;
  small?: boolean;
}) {
  return (
    <div className={`book-art ${template} ${small ? 'small' : ''}`}>
      <div className="book-shadow" />
      <div className="physical-book">
        <div
          className="book-photo"
          style={{
            backgroundImage: `url(https://images.unsplash.com/${photos[template] ?? photos.travel}?auto=format&fit=crop&w=700&q=85)`,
          }}
        />
        <div className="book-title">
          {title ??
            {
              travel: 'THE LONG WAY HOME',
              wedding: 'YOU & ME',
              family: 'LIFE, LATELY',
              birthday: 'MAKE A WISH',
              minimal: 'A MOMENT IN TIME',
            }[template]}
          <span>A COLLECTION OF LITTLE MOMENTS</span>
        </div>
      </div>
    </div>
  );
}

export function Arrow() {
  return <ArrowUpRight size={17} />;
}
