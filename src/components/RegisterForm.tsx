'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

interface RegisterFormProps {
  error?: string | null;
  onRegisterAction: (
    formData: FormData
  ) => Promise<{ success?: boolean; error?: string; name?: string; email?: string }>;
}

// Standard PH OJT requirement: 486 total hours, worked on weekdays only at 9 hrs/day
// (inclusive of the lunch/dinner break) -- used to pre-fill End of OJT from today's
// default Start of OJT.
const TOTAL_OJT_HOURS = 486;
const HOURS_PER_WORKDAY = 9;
const REQUIRED_WEEKDAYS = Math.ceil(TOTAL_OJT_HOURS / HOURS_PER_WORKDAY);

// Local (not UTC) YYYY-MM-DD, matching what a <input type="date"> picker shows for "today".
function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The date of the Nth weekday counting forward from `start` (start itself counts as
// day 1 if it's a weekday; weekends are skipped and don't advance the count).
function addWorkWeekdays(start: Date, weekdayCount: number): Date {
  const result = new Date(start);
  let weekdaysCounted = 0;
  while (weekdaysCounted < weekdayCount) {
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) weekdaysCounted++;
    if (weekdaysCounted === weekdayCount) break;
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export function RegisterForm({ error: initialError, onRegisterAction }: RegisterFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [school, setSchool] = useState('');
  const [batch, setBatch] = useState(() => String(new Date().getFullYear()));
  const [start, setStart] = useState(() => toDateInputValue(new Date()));
  const [end, setEnd] = useState(() => toDateInputValue(addWorkWeekdays(new Date(), REQUIRED_WEEKDAYS)));

  const [clientError, setClientError] = useState<string | null>(initialError || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedInfo, setSubmittedInfo] = useState<{ name: string; email: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientError(null);

    if (password.length < 12) {
      setClientError('Password must be at least 12 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setClientError('Passwords do not match.');
      return;
    }

    if (!/^\d{4}$/.test(batch.trim())) {
      setClientError('Batch year must be a 4-digit year (e.g. 2026).');
      return;
    }

    if (!start || !end) {
      setClientError('Please select both OJT start and end dates.');
      return;
    }

    if (new Date(end) <= new Date(start)) {
      setClientError('OJT End date must be after start date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('fullName', fullName.trim());
      formData.append('email', email.trim());
      formData.append('password', password);
      formData.append('confirmPassword', confirmPassword);
      formData.append('school', school.trim());
      formData.append('batch', batch.trim());
      formData.append('start', start);
      formData.append('end', end);

      const res = await onRegisterAction(formData);
      if (res && !res.success) {
        setClientError(res.error || 'Registration failed. Please try again.');
      } else {
        setSubmittedInfo({
          name: res?.name || fullName.trim(),
          email: res?.email || email.trim(),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setClientError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error banner */}
        {clientError && (
          <div
            role="alert"
            className="rounded-xl bg-status-returned/10 px-4 py-3 text-xs text-status-returned-text border border-status-returned/30"
          >
            {clientError}
          </div>
        )}

        {/* Full Name */}
        <div>
          <label htmlFor="register-name" className="block text-xs font-semibold text-text-primary mb-1">
            Full Name <span className="text-status-returned">*</span>
          </label>
          <input
            id="register-name"
            name="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Juan dela Cruz"
            className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="register-email" className="block text-xs font-semibold text-text-primary mb-1">
            Email Address <span className="text-status-returned">*</span>
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="intern@university.edu.ph"
            className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
          />
        </div>

        {/* Password & Confirm Password */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="register-password" className="block text-xs font-semibold text-text-primary mb-1">
              Password <span className="text-status-returned">*</span>
            </label>
            <div className="relative">
              <input
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Min 12 characters"
                className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 pr-9 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="block text-xs font-semibold text-text-primary mb-1">
              Confirm Password <span className="text-status-returned">*</span>
            </label>
            <div className="relative">
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={12}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter password"
                className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 pr-9 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* School & Batch Year */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="register-school" className="block text-xs font-semibold text-text-primary mb-1">
              School / University <span className="text-status-returned">*</span>
            </label>
            <input
              id="register-school"
              name="school"
              type="text"
              required
              maxLength={200}
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="e.g. University of the Philippines"
              className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label htmlFor="register-batch" className="block text-xs font-semibold text-text-primary mb-1">
              Batch Year <span className="text-status-returned">*</span>
            </label>
            <input
              id="register-batch"
              name="batch"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              value={batch}
              onChange={(e) => setBatch(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 2026"
              className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
            />
          </div>
        </div>


        {/* OJT Start & End Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="register-start" className="block text-xs font-semibold text-text-primary mb-1">
              Start of OJT <span className="text-status-returned">*</span>
            </label>
            <input
              id="register-start"
              name="start"
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label htmlFor="register-end" className="block text-xs font-semibold text-text-primary mb-1">
              End of OJT <span className="text-status-returned">*</span>
            </label>
            <input
              id="register-end"
              name="end"
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-xl border border-border-default bg-white px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Submit button */}
        <Button
          type="submit"
          id="register-submit"
          disabled={isSubmitting}
          size="lg"
          className="w-full rounded-xl py-3 text-xs tracking-wide shadow-lg shadow-brand-primary/20 active:scale-[0.98] mt-2"
        >
          {isSubmitting ? 'Submitting Registration...' : 'Submit Registration for Approval'}
        </Button>

        {/* Sign-in link */}
        <div className="pt-2 text-center border-t border-border-default">
          <p className="text-xs text-text-muted">
            Already have an account?{' '}
            <a
              href="/login"
              className="font-semibold text-brand-primary hover:text-brand-primary-hover hover:underline transition-colors"
            >
              Sign in
            </a>
          </p>
        </div>
      </form>

      {/* Floating Modal for Pending Approval Notification */}
      {submittedInfo && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 md:p-8 shadow-2xl border border-border-default text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-status-in-review/10 text-status-in-review-text border border-status-in-review/30">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center rounded-full bg-status-in-review/20 px-2.5 py-0.5 text-[11px] font-semibold text-status-in-review-text">
                Pending Approval
              </span>
              <h3 className="text-xl font-bold text-text-primary">Registration Submitted!</h3>
              <p className="text-xs text-text-muted leading-relaxed max-w-sm mx-auto">
                Thank you for registering, <strong className="text-text-primary">{submittedInfo.name}</strong>. Your account has been submitted and is currently pending administrator approval before you can join the cohort.
              </p>
              <div className="rounded-xl bg-surface-muted p-3 text-[11px] text-text-muted text-left border border-border-default space-y-1">
                <p>
                  <strong>Notice:</strong> Login is temporarily locked while under review.
                </p>
                <p>
                  Once an administrator admits you to the cohort, a confirmation email will be sent to{' '}
                  <strong className="text-text-primary">{submittedInfo.email}</strong>.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="/login"
                className="inline-flex items-center justify-center w-full rounded-xl bg-brand-primary py-3 text-xs font-semibold text-white hover:bg-brand-primary-hover shadow-xs transition-colors"
              >
                Return to Sign in
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
