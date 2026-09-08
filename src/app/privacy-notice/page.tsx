import { redirect } from 'next/navigation';
import { createClient } from '@lib/supabase/server';
import { acknowledgePrivacyNotice } from '@lib/data/privacy';
import { Button } from '@/components/ui/button';

// FR-25 (G5): shown and acknowledged at first login, acknowledgement recorded.
// Draft notice content -- the Data Protection Officer's name (required for a
// finished RA 10173 notice; "Makerspace" as an organisation cannot itself be
// registered with the NPC as DPO) has not been provided yet (prd-intern-docflow.md
// section 14, "NEEDS INPUT"). Uses a role-based contact instead of a fabricated
// name; must be replaced with the named DPO's contact details before go-live.
export default async function PrivacyNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams.error;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('privacy_acknowledged_at')
    .eq('id', user.id)
    .single();

  if (dbUser?.privacy_acknowledged_at) {
    redirect('/');
  }

  async function handleAcknowledge(formData: FormData) {
    'use server';
    if (formData.get('acknowledge') !== 'on') {
      redirect('/privacy-notice?error=' + encodeURIComponent('Please confirm you have read the notice before continuing.'));
    }
    try {
      await acknowledgePrivacyNotice();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to record acknowledgement';
      redirect('/privacy-notice?error=' + encodeURIComponent(msg));
    }
    redirect('/');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg bg-surface-bg shadow-md border border-border-default">
        <div className="p-6 border-b border-border-default">
          <h1 className="text-2xl font-bold text-text-primary">Privacy Notice</h1>
          <p className="mt-1 text-sm text-text-muted">
            Please read this notice before continuing. You must acknowledge it once, at first login.
          </p>
        </div>

        <div
          className="max-h-96 overflow-y-auto p-6 space-y-4 text-sm text-text-primary"
          tabIndex={0}
          role="region"
          aria-label="Privacy notice text"
        >
          <section>
            <h2 className="font-semibold text-text-primary mb-1">What InternDocs collects</h2>
            <p>
              InternDocs is Makerspace&rsquo;s internal system for tracking intern document requirements.
              It holds: your account information (name, email, role, internship start and end dates);
              the documents you submit (evaluation papers, Daily Time Records); approval records
              (who approved, when, and the version approved); and a security audit log recording
              login, upload, download, approval, and similar actions against your account, including
              the IP address the action was made from.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-1">Why we process it</h2>
            <p>
              This data is processed to administer your internship documentation requirements with
              Makerspace and, where applicable, your school &mdash; verifying attendance and evaluation
              records, routing them to the correct approver, and keeping a record that a document was
              reviewed and signed. Processing is carried out under the Data Privacy Act of 2012
              (Republic Act No. 10173), on the basis that it is necessary to administer the internship
              program you are enrolled in, and on your acknowledgement of this notice.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-1">Who can see it</h2>
            <p>
              Access is role-scoped and enforced at the database level, not only in the interface: you
              can see your own submissions and account details; approvers can see submissions currently
              assigned to them, or that they have previously acted on; administrators can see submissions
              and account details needed to run the program. No document is ever made publicly accessible.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-1">How long we keep it</h2>
            <p>
              Submitted document files are deleted automatically 30 days after final approval, or 30 days
              after your internship end date if never approved. The record that an approval happened &mdash;
              who approved it, when, and its file hash &mdash; is kept for at least 3 years after the file is
              deleted, so that an approval can still be verified after the document itself is gone.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-1">Your rights</h2>
            <p>
              Under the Data Privacy Act, you have the right to be informed of how your data is
              processed, to access it, to request correction of inaccurate data, and to object to or
              request erasure of it (subject to the retention periods above, which exist to preserve a
              legally reliable approval record). You may raise a request or concern with your Makerspace
              program coordinator, or file a complaint with the National Privacy Commission
              (privacy.gov.ph) if you believe your data has been mishandled.
            </p>
          </section>
        </div>

        <div className="p-6 border-t border-border-default">
          {error && (
            <div role="alert" className="mb-4 rounded bg-status-returned/10 p-3 text-sm text-status-returned-text border border-status-returned/30">
              {error}
            </div>
          )}

          <form action={handleAcknowledge} className="flex flex-col space-y-4">
            <label className="flex items-start gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                name="acknowledge"
                required
                className="mt-0.5 h-4 w-4 rounded border-border-default text-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
              <span>I have read and understood this privacy notice.</span>
            </label>
            <Button type="submit" className="w-full" size="lg">
              Continue
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
