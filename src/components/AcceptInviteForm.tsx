'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

export interface OnboardingInput {
  fullName: string;
  password: string;
  internshipStart?: string;
  internshipEnd?: string;
  privacyAcknowledged?: boolean;
}

interface AcceptInviteFormProps {
  onGetContextAction: () => Promise<{ role: string | null }>;
  onCompleteAction: (input: OnboardingInput) => Promise<{ success?: boolean; error?: string }>;
}

export function AcceptInviteForm({ onGetContextAction, onCompleteAction }: AcceptInviteFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [internshipStart, setInternshipStart] = useState('');
  const [internshipEnd, setInternshipEnd] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function initInviteAuth() {
      try {
        if (typeof window === 'undefined') return;

        // 1. Parse Hash Fragment (Supabase redirect with #access_token=...&refresh_token=...)
        if (window.location.hash && window.location.hash.includes('access_token')) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');

          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) {
              console.warn('[Auth] setSession from hash error:', error.message);
            } else if (data.user) {
              setUserEmail(data.user.email || null);
            }
          }
        }

        // 2. Parse Query Params (PKCE code or OTP token_hash)
        const urlParams = new URLSearchParams(window.location.search);
        const token_hash = urlParams.get('token_hash');
        const type = urlParams.get('type') as 'invite' | 'recovery' | 'email' | null;
        const code = urlParams.get('code');

        if (token_hash && type) {
          const { data, error: otpErr } = await supabase.auth.verifyOtp({ token_hash, type });
          if (!otpErr && data.user) {
            setUserEmail(data.user.email || null);
          }
        } else if (code) {
          const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!codeErr && data.user) {
            setUserEmail(data.user.email || null);
          }
        }

        // 3. Fallback: Check existing session
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || null);
        }

        // 4. Now that a session (should) exist, ask the server which role this
        // invitation is for -- decides whether to show the intern-only fields.
        // Never trust a client-derived value for this: it drives which fields are
        // required, so it has to come from the authoritative users.role row.
        try {
          const context = await onGetContextAction();
          setRole(context.role);
        } catch (err) {
          console.warn('[Onboarding] Failed to load role context:', err);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const isIntern = role === 'intern';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    if (password.length < 12) {
      setErrorMsg('Password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (isIntern) {
      if (!internshipStart || !internshipEnd) {
        setErrorMsg('Please provide your internship start and end dates.');
        return;
      }
      if (new Date(internshipEnd) <= new Date(internshipStart)) {
        setErrorMsg('Internship end date must be after the start date.');
        return;
      }
      if (!privacyAcknowledged) {
        setErrorMsg('Please acknowledge the privacy notice before continuing.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await onCompleteAction({
        fullName: fullName.trim(),
        password,
        ...(isIntern ? { internshipStart, internshipEnd, privacyAcknowledged } : {}),
      });

      if (res.error) {
        throw new Error(res.error);
      }

      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete account setup. Please try again.';
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
              <>Setting up account for <span className="font-semibold text-text-primary">{userEmail}</span></>
            ) : (
              'Set your password to activate your account.'
            )}
          </p>
        </div>

        {errorMsg && (
          <div role="alert" className="rounded-xl bg-status-returned/10 p-3.5 text-xs text-status-returned-text border border-status-returned/30">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              minLength={2}
              maxLength={150}
              required
              placeholder="e.g. Juan Dela Cruz"
            />
            <p className="mt-1 text-[11px] text-text-muted">This is the printed name shown wherever your identity appears on a document.</p>
          </div>

          <div>
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
              placeholder="Minimum 12 characters"
            />
            <p className="mt-1 text-[11px] text-text-muted">Must be at least 12 characters long.</p>
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={12}
              required
              placeholder="Re-enter your password"
            />
          </div>

          {isIntern && (
            <div className="space-y-4 rounded-xl border border-border-default bg-surface-muted p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Internship Details</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="internshipStart">Start Date</Label>
                  <Input
                    id="internshipStart"
                    type="date"
                    value={internshipStart}
                    onChange={(e) => setInternshipStart(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="internshipEnd">End Date</Label>
                  <Input
                    id="internshipEnd"
                    type="date"
                    value={internshipEnd}
                    onChange={(e) => setInternshipEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer" htmlFor="privacyAcknowledged">
                <Checkbox
                  id="privacyAcknowledged"
                  checked={privacyAcknowledged}
                  onChange={(e) => setPrivacyAcknowledged(e.target.checked)}
                  required
                />
                <span className="text-[11px] text-text-primary leading-snug">
                  I have read and understood the{' '}
                  <a
                    href="/privacy-notice"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-primary hover:underline"
                  >
                    Privacy Notice
                  </a>{' '}
                  covering how my internship documents and account data are processed.
                </span>
              </label>
            </div>
          )}

          <Button type="submit" disabled={loading || isVerifying} className="w-full" size="lg">
            {loading ? 'Activating Account...' : isVerifying ? 'Verifying Invite...' : 'Set Password & Enter Portal'}
          </Button>
        </form>
      </div>
    </div>
  );
}
