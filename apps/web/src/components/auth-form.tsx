'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import { registerSchema } from '@photoforge/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEditor } from '@/lib/editor-store';
import { post } from '@/lib/api';
import { Logo, BookArt, ErrorMessage } from './ui';

type Values = z.infer<typeof registerSchema>;

export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const form = useForm<Values>({
    resolver: zodResolver(register ? registerSchema : registerSchema.extend({ name: z.string() })),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  async function done() {
    useEditor.setState({
      bookId: '',
      document: null,
      past: [],
      future: [],
    });
    client.removeQueries();
    router.push('/dashboard');
    router.refresh();
  }

  async function demo() {
    setBusy(true);
    setError('');
    try {
      await post('/auth/demo');
      await done();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (search.get('demo') === 'true' && !started.current) {
      started.current = true;
      void demo();
    }
  }, [search]);

  return (
    <div className="auth-page">
      <div className="auth-main">
        <Logo />
        <div className="auth-form">
          <div className="eyebrow">A LITTLE SPACE FOR YOUR STORIES</div>
          <h1>{register ? 'Make room for memories.' : 'Welcome back.'}</h1>
          <p className="muted">
            {register
              ? 'Your next favourite book starts right here.'
              : 'Your next chapter is waiting for you.'}
          </p>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              setError('');
              try {
                await post(register ? '/auth/register' : '/auth/login', values);
                await done();
              } catch (e) {
                setError((e as Error).message);
              }
            })}
          >
            {register && (
              <label>
                Your name
                <input autoComplete="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <small className="field-error">{form.formState.errors.name.message}</small>
                )}
              </label>
            )}
            <label>
              Email address
              <input type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <small className="field-error">{form.formState.errors.email.message}</small>
              )}
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                {...form.register('password')}
              />
              <small>{form.formState.errors.password?.message ?? 'At least 12 characters.'}</small>
            </label>
            {error && <ErrorMessage message={error} />}
            <button disabled={form.formState.isSubmitting || busy} className="btn primary full">
              {form.formState.isSubmitting
                ? 'One moment…'
                : register
                  ? 'Create your account'
                  : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-divider">
            <span>or get a feel for things</span>
          </div>
          <button
            disabled={busy || form.formState.isSubmitting}
            className="btn secondary full"
            onClick={() => void demo()}
          >
            {busy ? 'Preparing your workspace…' : 'Explore the demo studio'}
          </button>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to PhotoForge?'}{' '}
            <Link href={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
        <small>Guest projects are private and available for 24 hours.</small>
      </div>
      <div className="auth-visual">
        <BookArt template="family" />
        <h2>
          Some things are
          <br />
          too good to leave
          <br />
          <em>on your phone.</em>
        </h2>
        <p>Turn a thousand little moments into one beautiful story.</p>
      </div>
    </div>
  );
}
