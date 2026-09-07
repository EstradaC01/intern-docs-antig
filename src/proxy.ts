import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

export async function proxy(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              supabaseResponse.cookies.set(name, value, options);
            });
          } catch {
            // Ignored in middleware
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Idle timeout logic
  const now = Date.now();
  const lastActiveStr = request.cookies.get('last_active')?.value;
  
  if (user) {
    if (lastActiveStr) {
      const lastActive = parseInt(lastActiveStr, 10);
      if (now - lastActive > IDLE_TIMEOUT_MS) {
        // Sign out due to inactivity
        await supabase.auth.signOut();
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        redirectUrl.searchParams.set('reason', 'timeout');
        const response = NextResponse.redirect(redirectUrl);
        response.cookies.delete('last_active');
        return response;
      }
    }
    
    // Update last_active
    supabaseResponse.cookies.set('last_active', now.toString(), {
      path: '/',
      maxAge: 60 * 60, // 60 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }

  // Route classification
  const pathname = request.nextUrl.pathname;
  const isAuthCallback = pathname.startsWith('/auth');
  const isCronRoute = pathname.startsWith('/api/cron');
  const isLoginPage = pathname.startsWith('/login');
  const isRegisterPage = pathname.startsWith('/register');
  const isAcceptInvite = pathname.startsWith('/accept-invite');
  const isForgotPassword = pathname.startsWith('/forgot-password');
  const isResetPassword = pathname.startsWith('/reset-password');

  // Allow all /auth routes unconditionally (callback code exchange, signout, OTP verification).
  // Also allow /api/cron/* unconditionally: these are system-to-system calls from
  // pg_cron -> pg_net (supabase/migrations/20240101000019_schedule_jobs.sql), authenticated
  // by a shared CRON_SECRET header checked inside each route handler
  // (src/app/api/cron/*/route.ts), never by a Supabase session. Without this exemption an
  // unauthenticated pg_net POST was redirected to /login before the handler's secret check
  // ever ran -- pg_net doesn't follow redirects, so the retention sweep and daily digest
  // jobs never actually executed on schedule.
  if (isAuthCallback || isCronRoute) {
    return supabaseResponse;
  }

  // Unauthenticated users can access /login, /register, /accept-invite, /forgot-password, and /reset-password
  if (!user) {
    if (isLoginPage || isRegisterPage || isAcceptInvite || isForgotPassword || isResetPassword) {
      return supabaseResponse;
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated users visiting /login, /register, or /forgot-password should be sent to their dashboard
  if (isLoginPage || isRegisterPage || isForgotPassword) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated users on /accept-invite or /reset-password can stay to set their password
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
