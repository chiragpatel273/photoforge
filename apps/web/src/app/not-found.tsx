import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container error-page">
      <div className="eyebrow">PAGE NOT FOUND</div>
      <h1>This chapter is missing.</h1>
      <Link className="btn primary" href="/dashboard">
        Back to your workspace
      </Link>
    </main>
  );
}
