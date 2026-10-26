import Link from 'next/link';
import {
  ArrowRight,
  MoveUpRight,
  Check,
  Images,
  MousePointer2,
  BookOpen,
  Leaf,
} from 'lucide-react';
import { Logo, BookArt } from '@/components/ui';

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav container">
        <Logo />
        <nav>
          <Link href="/templates">The collection</Link>
          <a href="#how">How it works</a>
          <Link href="/login">Sign in</Link>
          <Link href="/register" className="btn primary">
            Start your story <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-line" /> LIFE HAPPENS. KEEP THE GOOD PARTS.
            </div>
            <h1>
              Your moments.
              <br />
              Beautifully <em>bound.</em>
            </h1>
            <p>
              That unforgettable trip. The little everyday things.
              <br />
              Turn the photos you love into a book you’ll treasure.
            </p>
            <div className="hero-actions">
              <Link href="/templates" className="btn primary large">
                Make your photobook <ArrowRight size={18} />
              </Link>
              <Link href="/login?demo=true" className="text-link">
                Take a look around <MoveUpRight size={16} />
              </Link>
            </div>
            <div className="hero-benefits">
              <span>
                <Check size={14} />
                No design skills needed
              </span>
              <span>
                <Check size={14} />
                Free to create
              </span>
            </div>
          </div>
          <div className="hero-books">
            <div className="hero-orbit" />
            <div className="back-book">
              <BookArt template="wedding" />
            </div>
            <div className="front-book">
              <BookArt template="travel" />
            </div>
            <span className="hand-note">a little piece of forever ↗</span>
            <div className="hero-tag">
              <Leaf size={20} />
              <div>
                Made with care.<small>Designed to be kept.</small>
              </div>
            </div>
          </div>
        </section>
        <section className="trust-strip">
          <span>LESS SCROLLING. MORE REMEMBERING.</span>
          <i />
          <span>YOUR PHOTOS, YOUR STORY</span>
          <i />
          <span>THOUGHTFULLY DESIGNED TEMPLATES</span>
        </section>
        <section className="container landing-collection">
          <div className="section-head">
            <div>
              <div className="eyebrow">A GOOD STORY STARTS HERE</div>
              <h2>There’s a book for every chapter.</h2>
            </div>
            <Link href="/templates" className="text-link">
              Explore the collection <ArrowRight size={18} />
            </Link>
          </div>
          <div className="collection-grid">
            {[
              {
                id: 'travel',
                label: 'Far from ordinary',
                category: 'TRAVEL & ADVENTURE',
              },
              {
                id: 'wedding',
                label: 'For your forever',
                category: 'WEDDINGS & LOVE',
              },
              {
                id: 'family',
                label: 'The beautiful everyday',
                category: 'FAMILY & LITTLE MOMENTS',
              },
            ].map((t) => (
              <Link href={`/templates?category=${t.id}`} key={t.id} className="collection-card">
                <BookArt template={t.id} />
                <div className="collection-caption">
                  <div>
                    <small>{t.category}</small>
                    <h3>{t.label}</h3>
                  </div>
                  <span className="round-arrow">
                    <ArrowRight size={18} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section id="how" className="how-section container">
          <div className="eyebrow">FROM CAMERA ROLL TO COFFEE TABLE</div>
          <h2>A little creativity. A lifetime of memories.</h2>
          <div className="steps">
            {[
              {
                icon: Images,
                title: 'Gather the good stuff',
                text: 'Upload the moments you want to hold on to. We’ll take care of the image processing.',
              },
              {
                icon: MousePointer2,
                title: 'Make it your own',
                text: 'Pick a template, arrange your photos, and add the words that tell your story.',
              },
              {
                icon: BookOpen,
                title: 'Keep it forever',
                text: 'Preview every page and download a PDF with bleed and trim boxes.',
              },
            ].map((s, i) => (
              <div key={s.title}>
                <span className="step-icon">
                  <s.icon size={25} />
                </span>
                <small>0{i + 1}</small>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="landing-cta">
          <span className="eyebrow">YOUR CAMERA ROLL IS FULL OF STORIES.</span>
          <h2>Let’s give them a home.</h2>
          <Link href="/login?demo=true" className="btn primary large">
            Try the creative studio <ArrowRight size={18} />
          </Link>
          <p>No account needed. Your guest workspace lasts 24 hours.</p>
        </section>
      </main>
      <footer className="landing-footer container">
        <Logo />
        <span>Made for moments that matter.</span>
        <span>© {new Date().getFullYear()} PhotoForge</span>
      </footer>
    </div>
  );
}
