'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function initInviteAuth() {
      try {
        if (typeof window === 'undefined') return;

        // 1. Check for error in hash or query
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
              console.warn('[Auth] setSession from hash error:', error.message);
              setErrorMsg(error.message);
            } else if (data.user) {
              setUserEmail(data.user.email || null);
            }
          }
        }

        // 3. Parse Query Params (PKCE code or OTP token_hash)
        const token_hash = urlParams.get('token_hash') || urlParams.get('token');
        // Narrowed to the email OTP types verifyOtp accepts rather than `any`, which was a
        // lint error and left a bad value (say ?type=sms) to fail at runtime instead.
        const rawType = urlParams.get('type');
        const emailOtpTypes = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const;
        type EmailOtpType = (typeof emailOtpTypes)[number];
        const type: EmailOtpType = emailOtpTypes.includes(rawType as EmailOtpType)
          ? (rawType as EmailOtpType)
          : 'invite';
        const code = urlParams.get('code');

        if (token_hash) {
          const { data, error: otpErr } = await supabase.auth.verifyOtp({ token_hash, type });
          if (otpErr) {
            console.warn('[Auth] verifyOtp error:', otpErr.message);
            setErrorMsg(otpErr.message);
          } else if (data.user) {
            setUserEmail(data.user.email || null);
          }
        } else if (code) {
          const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (codeErr) {
            console.warn('[Auth] exchangeCode error:', codeErr.message);
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
        console.warn('[Auth] Initialization error:', err);
      } finally {
        setIsVerifying(false);
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || null);
      }
    });

    initInviteAuth();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 12) {
      setErrorMsg('Password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
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
          'Your invitation session has expired or is invalid. Please request a new invite link.'
        );
      }

      // 2. Update the user password
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      // 3. Redirect to root dispatcher (routes to privacy-notice -> onboarding -> intern)
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set password. Please try again.';
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
          <h1 className="text-xl font-bold text-text-primary">Welcome to InternDocs</h1>
          <p className="text-xs text-text-muted">
            {userEmail ? (
              <>
                Setting up account for{' '}
                <span className="font-semibold text-text-primary">{userEmail}</span>
              </>
            ) : isVerifying ? (
              'Verifying your invitation session...'
            ) : (
              'Set your password to activate your account.'
            )}
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-status-returned/10 p-3.5 text-xs text-status-returned-text border border-status-returned/30 leading-relaxed"
          >
            {errorMsg}
          </div>
        )}

        {/* If verifying, show spinner */}
        {isVerifying && (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <p className="text-xs text-text-muted">Checking activation link...</p>
          </div>
        )}

        {/* If not verifying and no user email, show clear instructions instead of a broken password form */}
        {!isVerifying && !userEmail && (
          <div className="space-y-4 text-center pt-2">
            <p className="text-xs text-text-muted leading-relaxed">
              No active invitation session was found. If you received an activation email, please open the link directly from your inbox.
            </p>
            <div className="space-y-2 pt-2">
              <a
                href="/register"
                className="inline-flex items-center justify-center w-full rounded-xl bg-brand-primary py-2.5 text-xs font-semibold text-white hover:bg-brand-primary-hover shadow-xs transition-colors"
              >
                Request New Activation Link
              </a>
              <a
                href="/login"
                className="inline-flex items-center justify-center w-full rounded-xl border border-border-default bg-white py-2.5 text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors"
              >
                Back to Sign in
              </a>
            </div>
          </div>
        )}

        {/* If user session is active, show the password form */}
        {!isVerifying && userEmail && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold text-text-primary mb-1.5"
                htmlFor="password"
              >
                New Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                required
                placeholder="Minimum 12 characters"
                className="w-full rounded-xl border border-border-default p-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
              <p className="mt-1 text-[11px] text-text-muted">
                Must be at least 12 characters long.
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-semibold text-text-primary mb-1.5"
                htmlFor="confirmPassword"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={12}
                required
                placeholder="Re-enter your password"
                className="w-full rounded-xl border border-border-default p-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? 'Activating Account...' : 'Set Password & Enter Portal'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
