'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark, Wordmark } from './Logo';
import { Button } from './ui/button';
import { SignOutButton } from './SignOutButton';

interface NavItem {
  label: string;
  href: string;
}

interface RoleSidebarProps {
  roleTitle: string;
  userName: string;
  navItems: NavItem[];
  children: React.ReactNode;
}

export function RoleSidebar({ roleTitle, userName, navItems, children }: RoleSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-surface-bg border-b border-border-default p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-primary flex items-center justify-center text-white p-1.5 shrink-0">
            <LogoMark className="h-full w-full" />
          </div>
          <span className="font-bold text-text-primary">{roleTitle}</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary rounded"
          aria-label="Toggle menu"
          aria-expanded={isOpen}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Sidebar (Drawer on mobile, permanent on desktop) */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40 h-[100dvh] w-64 bg-surface-bg border-r border-border-default
          flex flex-col transform transition-transform duration-200 ease-in-out shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-6 hidden md:flex items-center gap-3 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-brand-primary flex items-center justify-center text-white p-2 shrink-0">
            <LogoMark className="h-full w-full" />
          </div>
          <div>
            <Wordmark className="text-xl" />
            <p className="text-xs text-text-muted">{roleTitle}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-1">
          {(() => {
            // Pick the single most-specific matching href so a parent route (e.g. /system-admin)
            // doesn't stay highlighted alongside a child route (e.g. /system-admin/audit-log).
            const activeHref = navItems
              .map((i) => i.href)
              .filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
              .sort((a, b) => b.length - a.length)[0];

            return navItems.map((item) => {
              const isActive = item.href === activeHref;
              return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`
                  block pl-3.5 pr-4 py-2.5 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary border-l-[3px]
                  ${isActive
                    ? 'bg-brand-primary text-white font-bold border-transparent shadow-xs'
                    : 'text-text-primary hover:bg-surface-hover hover:text-brand-primary font-medium border-transparent'
                  }
                `}
              >
                {item.label}
              </Link>
              );
            });
          })()}
        </nav>

        <div className="p-6 pb-12 border-t border-border-default shrink-0">
          <p className="text-sm font-semibold text-text-primary truncate mb-3" title={userName}>
            {userName}
          </p>
          <SignOutButton className="w-full justify-start" />
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}
