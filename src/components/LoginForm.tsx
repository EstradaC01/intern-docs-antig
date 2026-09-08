'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface LoginFormProps {
  error?: string | null;
  reason?: string | null;
  reset?: string | null;
  onLoginAction: (formData: FormData) => void;
}

export function LoginForm({ error, reason, reset, onLoginAction }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={onLoginAction} className="space-y-5">
      {/* Password reset success notice */}
      {reset === 'success' && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl bg-status-approved/10 px-4 py-3 text-xs text-status-approved-text border border-status-approved/30 leading-relaxed"
        >
          <svg
            className="h-4 w-4 shrink-0 text-status-approved mt-0.5"
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
          <span className="flex-1 font-medium">
            Your password has been reset successfully. Please sign in with your new password.
          </span>
        </div>
      )}

      {/* Session timeout notice */}
      {reason === 'timeout' && (
        <div
          role="alert"
          className="rounded-xl bg-status-in-review/10 px-4 py-3 text-sm text-status-in-review-text border border-status-in-review/30"
        >
          Your session expired due to inactivity. Please sign in again.
        </div>
      )}

      {/* Pending approval notice */}
      {reason === 'pending_approval' && (
        <div
          role="alert"
          className="rounded-xl bg-status-in-review/10 px-4 py-3 text-xs text-status-in-review-text border border-status-in-review/30 space-y-1"
        >
          <p className="font-semibold">Registration Pending Approval</p>
          <p className="text-status-in-review-text/90">
            Your account is awaiting administrator approval. An email notification will be sent once you are admitted to the cohort.
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-status-returned/10 px-4 py-3 text-sm text-status-returned-text border border-status-returned/30"
        >
          {error}
        </div>
      )}

      {/* Email field */}
      <div>
        <label
          htmlFor="login-email"
          className="block text-sm font-semibold text-text-primary mb-1.5"
        >
          Email address
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@makerspace.ph"
          className="
            w-full rounded-xl border border-border-default bg-white
            px-4 py-3 text-sm text-text-primary
            placeholder:text-text-muted
            focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20
            focus:outline-none transition-all
          "
        />
      </div>

      {/* Password field with show/hide */}
      <div>
        <label
          htmlFor="login-password"
          className="block text-sm font-semibold text-text-primary mb-1.5"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="
              w-full rounded-xl border border-border-default bg-white
              px-4 py-3 pr-12 text-sm text-text-primary
              placeholder:text-text-muted
              focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20
              focus:outline-none transition-all
            "
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="
              absolute right-3 top-1/2 -translate-y-1/2
              p-1 rounded-lg text-text-muted
              hover:text-brand-primary hover:bg-brand-primary/5
              focus:outline-none focus:ring-2 focus:ring-brand-primary/30
              transition-colors
            "
          >
            {showPassword ? (
              /* Eye-off icon */
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              /* Eye icon */
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Remember me + Forgot password row */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <input
            type="checkbox"
            name="remember"
            className="
              h-4 w-4 rounded border-border-strong text-brand-primary
              focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-0
              transition-colors cursor-pointer
            "
          />
          <span className="text-sm text-text-muted group-hover:text-text-primary transition-colors">
            Remember me
          </span>
        </label>
        <Link
          href="/forgot-password"
          className="
            text-sm font-medium text-brand-primary
            hover:text-brand-primary-hover hover:underline
            focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:rounded-sm
            transition-colors
          "
        >
          Forgot password?
        </Link>
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        id="login-submit"
        size="lg"
        className="w-full rounded-xl py-3.5 text-sm tracking-wide shadow-lg shadow-brand-primary/20 active:scale-[0.98]"
      >
        Sign in
      </Button>

      {/* Sign-up CTA */}
      <div className="pt-2 text-center border-t border-border-default">
        <p className="text-sm text-text-muted">
          Don&apos;t have an account yet?{' '}
          <a
            href="/register"
            className="font-semibold text-brand-primary hover:text-brand-primary-hover hover:underline transition-colors"
          >
            Sign up as an Intern
          </a>
        </p>
      </div>
    </form>
  );
}
