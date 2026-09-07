// Plain CommonJS Node script (no "type": "module" in package.json), run directly via
// `node scripts/send_temp_reset_link.js` -- require() is intentional here, not an
// oversight of the app's ESM/TS conventions.
/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendResetLink(targetEmail) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: targetEmail,
    options: {
      redirectTo: 'http://localhost:3000/reset-password',
    },
  });

  if (error || !data?.properties?.action_link) {
    console.error('Failed to generate link for', targetEmail, error);
    return null;
  }

  const actionLink = data.properties.action_link;
  console.log('\n======================================================');
  console.log(`[TEMPORARY RESET LINK FOR: ${targetEmail}]`);
  console.log(actionLink);
  console.log('======================================================\n');

  const emailRes = await resend.emails.send({
    from: 'InternDocs <onboarding@resend.dev>',
    to: 'ugotjohnm@gmail.com',
    subject: `InternDocs — Password Reset Link for ${targetEmail}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 560px; margin: 0 auto; line-height: 1.6;">
        <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: #92400e;">
          <strong>Resend Test Mode Forward:</strong> This email was delivered to your verified address (<strong>ugotjohnm@gmail.com</strong>) because Resend is currently in sandbox test mode. Target account: <strong>${targetEmail}</strong>.
        </div>
        <h2 style="color: #1e3a8a; margin-bottom: 12px;">Reset Password for ${targetEmail}</h2>
        <p>A password reset was requested for <strong>${targetEmail}</strong>. Click below to proceed:</p>
        <p style="margin: 24px 0;">
          <a href="${actionLink}" style="display: inline-block; background: #1e3a8a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Or open this temporary link directly in your browser:</p>
        <p style="font-size: 12px; color: #2563eb; word-break: break-all; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${actionLink}</p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 16px;">Link expires in 1 hour.</p>
      </div>
    `,
  });

  console.log('Resend response:', JSON.stringify(emailRes));
  return actionLink;
}

const emailToReset = process.argv[2] || 'garazav12@gmail.com';
sendResetLink(emailToReset);
