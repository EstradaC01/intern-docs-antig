'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ForgotPasswordFormProps {
  initialError?: string | null;
  onRequestReset: (
    email: string
  ) => Promise<{ success: boolean; error?: string; message?: string; temporaryLink?: string }>;
}

export function ForgotPasswordForm({
  initialError,
  onRequestReset,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError || null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [temporaryLink, setTemporaryLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setTemporaryLink(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onRequestReset(trimmed);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to send password reset link.');
      } else {
        setSuccessMsg(
          res.message ||
            'If an account exists with this email address, a password reset link has been sent.'
        );
        if (res.temporaryLink) {
          setTemporaryLink(res.temporaryLink);
        }
        setCooldown(60);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-status-returned/10 border border-status-returned/30 p-4 text-xs text-status-returned-text leading-relaxed"
        >
          <svg
            className="h-4 w-4 shrink-0 text-status-returned mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {successMsg ? (
        <div className="space-y-6">
          <div
            role="status"
            className="flex items-start gap-3.5 rounded-xl bg-status-approved/10 border border-status-approved/30 p-4 text-xs text-status-approved-text leading-relaxed"
          >
            <svg
              className="h-5 w-5 shrink-0 text-status-approved mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="space-y-1">
              <p className="font-semibold text-status-approved-text">Check your inbox</p>
              <p className="text-status-approved-text">{successMsg}</p>
              <p className="text-[11px] text-status-approved-text/80 pt-1">
                Be sure to check your spam or junk folders if the message doesn&apos;t arrive within a few minutes.
              </p>
            </div>
          </div>

          {temporaryLink && (
            <div className="rounded-xl bg-status-in-review/10 border border-status-in-review/30 p-4 text-xs text-status-in-review-text space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-status-in-review-text">
                <svg
                  className="h-4 w-4 text-status-in-review-text shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <span>Resend Test Sandbox: Direct Temporary Link</span>
              </div>
              <p className="text-[11px] text-status-in-review-text/90 leading-relaxed">
                Because Resend is in test mode (delivering to <strong>ugotjohnm@gmail.com</strong>), you can open or copy this temporary link directly:
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <a
                  href={temporaryLink}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-status-in-review text-white hover:bg-status-in-review-text px-3 py-2 text-xs font-semibold shadow-xs transition-colors"
                >
                  Open Reset Page
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(temporaryLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-status-in-review/40 bg-white hover:bg-status-in-review/10 text-status-in-review-text px-3 py-2 text-xs font-semibold shadow-xs transition-colors"
                >
                  {copied ? 'Copied to Clipboard!' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              type="button"
              disabled={cooldown > 0 || isSubmitting}
              onClick={() => {
                setSuccessMsg(null);
              }}
              className="w-full text-center text-xs font-semibold text-brand-primary hover:text-brand-primary-hover disabled:text-text-muted disabled:cursor-not-allowed transition-colors py-2"
            >
              {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Did not receive it? Try again'}
            </button>

            <Link
              href="/login"
              className="flex items-center justify-center w-full rounded-xl border border-border-default bg-white py-3 text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors"
            >
              Back to Sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="forgot-email"
              className="block text-xs font-semibold text-text-primary mb-1.5"
            >
              Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="e.g. maria@up.edu.ph"
              className="
                w-full rounded-xl border border-border-default bg-white px-3.5 py-3 text-sm
                text-text-primary placeholder:text-text-muted/60
                focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20
                transition-colors
              "
            />
            <p className="mt-1.5 text-[11px] text-text-muted">
              We will send a one-time password reset link to this address.
            </p>
          </div>

          <Button
            type="submit"
            id="forgot-submit"
            size="lg"
            disabled={isSubmitting || cooldown > 0}
            className="w-full rounded-xl py-3.5 text-sm tracking-wide shadow-lg shadow-brand-primary/20 active:scale-[0.98]"
          >
            {isSubmitting
              ? 'Sending Reset Link...'
              : cooldown > 0
              ? `Wait ${cooldown}s`
              : 'Send Reset Link'}
          </Button>

          <div className="pt-3 text-center border-t border-border-default">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:text-brand-primary-hover hover:underline transition-colors"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Return to Sign in
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
