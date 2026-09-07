import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@lib/supabase/server';
import { RoleSidebar } from '@/components/RoleSidebar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ApproverLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('email, role, privacy_acknowledged_at')
    .eq('id', user.id)
    .single();

  if (!dbUser || !['approver', 'admin', 'system_admin'].includes(dbUser.role)) {
    redirect('/login');
  }

  if (!dbUser.privacy_acknowledged_at) {
    redirect('/privacy-notice');
  }

  const navItems = [
    { label: 'Queue', href: '/approver' },
    { label: 'Signature Settings', href: '/approver/signature' },
  ];

  return (
    <RoleSidebar
      roleTitle="Approver Hub"
      userName={dbUser.email || 'Approver'}
      navItems={navItems}
    >
      {children}
    </RoleSidebar>
  );
}
