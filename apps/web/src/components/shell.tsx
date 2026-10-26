'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutGrid,
  PanelsTopLeft,
  ShoppingBag,
  LogOut,
  Plus,
  BookOpen,
  ArrowUpRight,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useEditor } from '@/lib/editor-store';
import { api, post, ApiError } from '@/lib/api';
import { Logo, Spinner, ErrorMessage } from './ui';

export type User = {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
};

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const user = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/auth/me'),
    retry: false,
  });

  useEffect(() => {
    if (user.error instanceof ApiError && user.error.status === 401) router.replace('/login');
  }, [user.error, router]);

  if (user.isPending) return <Spinner />;
  if (!user.data)
    return (
      <div className="container">
        <ErrorMessage message={user.error?.message ?? 'Please sign in'} />
        <Link href="/login">Go to sign in</Link>
      </div>
    );
  return (
    <div className="workspace">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Logo />
          <button
            className="icon-btn mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-label">YOUR CREATIVE SPACE</div>
        <nav>
          {[
            {
              href: '/dashboard',
              label: 'My photobooks',
              icon: LayoutGrid,
            },
            {
              href: '/templates',
              label: 'Explore templates',
              icon: PanelsTopLeft,
            },
            {
              href: '/orders',
              label: 'My orders',
              icon: ShoppingBag,
            },
          ].map((n) => (
            <Link
              onClick={() => setOpen(false)}
              href={n.href}
              key={n.href}
              className={`nav-item ${path.startsWith(n.href) ? 'active' : ''}`}
            >
              <n.icon size={18} />
              {n.label}
              {path.startsWith(n.href) && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <Link className="btn primary sidebar-create" href="/templates">
          <Plus size={17} />
          Create a photobook
        </Link>
        <div className="sidebar-bottom">
          <div className="little-note">
            <BookOpen size={24} />
            <strong>Memories deserve a home.</strong>
            <p>
              A coffee-table book today.
              <br />A family treasure tomorrow.
            </p>
            <Link href="/templates">
              Find your inspiration <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="account">
            <span className="avatar">{user.data.name.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{user.data.name}</strong>
              <small>
                {user.data.isGuest ? 'Guest workspace · 24 hours' : 'Personal workspace'}
              </small>
            </div>
            <button
              aria-label="Log out"
              className="icon-btn"
              onClick={async () => {
                await post('/auth/logout');
                useEditor.setState({
                  bookId: '',
                  document: null,
                  past: [],
                  future: [],
                });
                router.push('/');
                router.refresh();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="app-header">
          <div className="header-crumb">
            <button
              className="icon-btn mobile-only"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {path.startsWith('/orders')
                ? 'My orders'
                : path.startsWith('/templates')
                  ? 'Templates'
                  : 'My photobooks'}
            </strong>
          </div>
          <span className="header-note">
            <span className="status-dot" />
            {user.data.isGuest ? 'You’re in demo mode' : 'Your personal creative space'}
          </span>
        </header>
        <main className="app-content">{children}</main>
        <footer className="app-footer">
          <span>Made for moments that matter.</span>
          <span>PHOTOForge © {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  );
}
