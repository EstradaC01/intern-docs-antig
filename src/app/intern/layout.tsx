import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@lib/supabase/server';
import { LogoMark, Wordmark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/SignOutButton';

export default async function InternLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('email, internship_end, privacy_acknowledged_at')
    .eq('id', user.id)
    .single();

  if (!dbUser?.privacy_acknowledged_at) {
    redirect('/privacy-notice');
  }

  let daysRemaining = null;
  if (dbUser?.internship_end) {
    const end = new Date(dbUser.internship_end);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-brand-primary border-b border-brand-primary-hover px-6 py-4 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-4">
          <Link href="/intern" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white p-2 shrink-0 group-hover:bg-white/20 transition-colors">
              <LogoMark className="h-full w-full" />
            </div>
            <div>
              <Wordmark className="text-xl" onDark />
              <p className="text-xs text-slate-300 hidden sm:block">Makerspace Document Tracking</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-white">{dbUser?.email}</p>
            {daysRemaining !== null && (
              <p className="text-xs text-slate-300">
                {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Internship ended'}
              </p>
            )}
          </div>
          <SignOutButton className="border-white/25 text-white hover:bg-white/10 hover:text-white bg-transparent shadow-none" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
