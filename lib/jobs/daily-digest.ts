import { createAdminClient } from '../supabase/admin';
import { sendEmailWithRetry } from '../email/resend';
import { emailTemplates } from '../email/templates';

// Helper to count working days between two dates
function getWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sunday, 6 = Saturday
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export async function runDailyDigest() {
  const adminClient = createAdminClient();
  const now = new Date();

  // 1. Fetch all IN_REVIEW submissions
  const { data: submissions, error } = await adminClient
    .from('submissions')
    .select(`
      id,
      updated_at,
      created_at,
      current_step,
      current_step_entered_at,
      current_holder_id,
      intern_id,
      requirements(id, name, custom_reminder_days, routing_templates(sla_days)),
      users!submissions_intern_id_fkey(email)
    `)
    .eq('state', 'IN_REVIEW');

  if (error || !submissions) {
    console.error('Failed to fetch submissions for digest:', error);
    return;
  }

  // Deduplication: Fetch DAILY_REMINDER notifications sent today
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data: todayNotifications } = await adminClient
    .from('notifications')
    .select('payload')
    .eq('event_type', 'DAILY_REMINDER')
    .gte('created_at', startOfDay.toISOString());

  const sentToday = new Set(
    (todayNotifications || []).map(n => n.payload?.submission_id)
  );

  const approverReminders = new Map<string, number>(); // approver_id -> count
  const adminEscalations: { internEmail: string; reqName: string }[] = [];
  const notificationsToInsert: Record<string, unknown>[] = [];

  for (const sub of submissions) {
    // FR-19 SLA clock: measured from when the item entered its current step, not from
    // the last row write -- `updated_at` also bumps on unrelated edits (e.g. REASSIGN).
    const stepEnteredAt = new Date(sub.current_step_entered_at || sub.created_at);
    const waitingDays = getWorkingDays(stepEnteredAt, now);

    // Default SLA is 2 days if not specified in routing template. A requirement's own
    // custom_reminder_days, when set, overrides the shared routing_template's sla_days --
    // FR-19's approver-reminder threshold only, not the flat 5-day admin escalation above.
    // @ts-expect-error nested field mapping
    const sla = sub.requirements?.custom_reminder_days ?? sub.requirements?.routing_templates?.sla_days ?? 2;

    if (waitingDays > sla) {
      // PRD FR-19: admin gets copied on anything past 5 working days, independent of
      // the step's own SLA target.
      if (waitingDays > 5) {
        adminEscalations.push({
          // @ts-expect-error nested field mapping
          internEmail: sub.users?.email || 'Unknown',
          // @ts-expect-error nested field mapping
          reqName: sub.requirements?.name || 'Document',
        });
      }

      // "Max 1 reminder per item per day" throttles the approver digest only -- it must
      // not suppress the admin escalation above.
      if (sentToday.has(sub.id)) continue;

      if (sub.current_holder_id) {
        const count = approverReminders.get(sub.current_holder_id) || 0;
        approverReminders.set(sub.current_holder_id, count + 1);
      }

      notificationsToInsert.push({
        user_id: sub.current_holder_id || sub.intern_id,
        event_type: 'DAILY_REMINDER',
        payload: { submission_id: sub.id },
      });
    }
  }

  // 2. Send approver digest emails
  for (const [approverId, count] of approverReminders.entries()) {
    const { data: approver } = await adminClient.from('users').select('email').eq('id', approverId).single();
    if (approver?.email) {
      await sendEmailWithRetry(
        approver.email,
        'Daily Reminder: Pending Submissions',
        emailTemplates.dailyReminderApprover(count)
      );
    }
  }

  // 3. Send admin escalations
  if (adminEscalations.length > 0) {
    const { data: admins } = await adminClient.from('users').select('email').in('role', ['admin', 'system_admin']);
    const adminEmails = admins?.map(a => a.email) || [];
    
    for (const esc of adminEscalations) {
      for (const email of adminEmails) {
        await sendEmailWithRetry(
          email,
          `Admin Escalation: ${esc.reqName}`,
          emailTemplates.dailyReminderAdmin(esc.internEmail, esc.reqName)
        );
      }
    }
  }

  // 4. Record notifications to prevent duplicates
  if (notificationsToInsert.length > 0) {
    await adminClient.from('notifications').insert(notificationsToInsert);
  }

  console.log(`Daily digest complete. Sent ${approverReminders.size} approver reminders and ${adminEscalations.length} escalations.`);
}
