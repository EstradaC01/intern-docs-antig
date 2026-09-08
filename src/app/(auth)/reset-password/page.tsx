'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@lib/supabase/client';
import { recordPasswordUpdateAuditAction } from '@/app/actions/auth';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function initRecoveryAuth() {
      try {
        if (typeof window === 'undefined') return;

        // 1. Check for error in query params
        const urlParams = new URLSearchParams(window.location.search);
        const queryError = urlParams.get('error_description') || urlParams.get('error');
        if (queryError) {
          setErrorMsg(decodeURIComponent(queryError.replace(/\+/g, ' ')));
        }

        // 2. Parse Hash Fragment (Supabase redirect with #access_token=...&refresh_token=...)
        if (window.location.hash) {
          const hashClean = window.location.hash.startsWith('#')
            ? window.location.hash.substring(1)
            : window.location.hash;
          const hashParams = new URLSearchParams(hashClean);

          const hashError = hashParams.get('error_description') || hashParams.get('error');
          if (hashError) {
            setErrorMsg(decodeURIComponent(hashError.replace(/\+/g, ' ')));
          }

          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');

          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) {
              console.warn('[Recovery] setSession from hash error:', error.message);
              setErrorMsg(error.message);
            } else if (data.user) {
              setUserEmail(data.user.email || null);
            }
          }
        }

        // 3. Parse Query Params (PKCE code or OTP token_hash)
        const token_hash = urlParams.get('token_hash') || urlParams.get('token');
        const code = urlParams.get('code');

        if (token_hash) {
          const { data, error: otpErr } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery',
          });
          if (otpErr) {
            console.warn('[Recovery] verifyOtp error:', otpErr.message);
            setErrorMsg(otpErr.message);
          } else if (data.user) {
            setUserEmail(data.user.email || null);
          }
        } else if (code) {
          const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (codeErr) {
            console.warn('[Recovery] exchangeCode error:', codeErr.message);
            setErrorMsg(codeErr.message);
          } else if (data.user) {
            setUserEmail(data.user.email || null);
          }
        }

        // 4. Fallback: Check existing session in cookies/storage
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || null);
        }
      } catch (err) {
        console.warn('[Recovery] Initialization error:', err);
      } finally {
        setIsVerifying(false);
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || null);
      }
    });

    initRecoveryAuth();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 12) {
      setErrorMsg('Password must be at least 12 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      // 1. Verify / recover active session if needed
      let {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user && typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');

        if (access_token && refresh_token) {
          const { data } = await supabase.auth.setSession({ access_token, refresh_token });
          user = data.user;
        }
      }

      if (!user) {
        throw new Error(
          'Your password recovery session has expired or is invalid. Please request a new link.'
        );
      }

      // 2. Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      // 3. Record append-only audit event for password update
      try {
        await recordPasswordUpdateAuditAction();
      } catch (auditErr) {
        console.warn('[Audit] Non-fatal password update audit logging error:', auditErr);
      }

      // 4. Sign out from temporary recovery session so user signs in cleanly with new credentials
      await supabase.auth.signOut();

      // 5. Redirect to login with confirmation banner
      router.push('/login?reset=success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password. Please try again.';
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-surface-muted">
      <div className="w-full max-w-md rounded-2xl bg-surface-bg p-8 shadow-sm border border-border-default space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary text-white p-2.5 mb-1">
            <LogoMark className="h-full w-full" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Create New Password</h1>
          <p className="text-xs text-text-muted">
            {userEmail ? (
              <>
                Setting a new password for{' '}
                <span className="font-semibold text-text-primary">{userEmail}</span>
              </>
            ) : isVerifying ? (
              'Verifying your reset request...'
            ) : (
              'Enter and confirm your new account password.'
            )}
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl bg-status-returned/10 p-3.5 text-xs text-status-returned-text border border-status-returned/30 leading-relaxed"
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

        {/* Verifying state spinner */}
        {isVerifying && (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <p className="text-xs text-text-muted">Validating password reset link...</p>
          </div>
        )}

        {/* Expired or invalid session */}
        {!isVerifying && !userEmail && (
          <div className="space-y-4 text-center pt-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-in-review/10 border border-status-in-review/30">
              <svg
                className="h-6 w-6 text-status-in-review-text"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-text-primary">Reset Link Expired or Invalid</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                This password reset link is invalid, has expired, or has already been used. Please submit a new request.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center w-full rounded-xl bg-brand-primary py-2.5 text-xs font-semibold text-white hover:bg-brand-primary-hover shadow-xs transition-colors"
              >
                Request New Reset Link
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full rounded-xl border border-border-default bg-white py-2.5 text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors"
              >
                Back to Sign in
              </Link>
            </div>
          </div>
        )}

        {/* Valid recovery session form */}
        {!isVerifying && userEmail && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold text-text-primary mb-1.5"
                htmlFor="new-password"
              >
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  required
                  placeholder="Minimum 12 characters"
                  className="w-full rounded-xl border border-border-default p-2.5 pr-10 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Must be at least 12 characters long.
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-semibold text-text-primary mb-1.5"
                htmlFor="confirm-password"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={12}
                  required
                  placeholder="Re-enter your new password"
                  className="w-full rounded-xl border border-border-default p-2.5 pr-10 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 focus:outline-none"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm tracking-wide shadow-lg shadow-brand-primary/20"
              size="lg"
            >
              {loading ? 'Updating Password...' : 'Save Password & Sign In'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
