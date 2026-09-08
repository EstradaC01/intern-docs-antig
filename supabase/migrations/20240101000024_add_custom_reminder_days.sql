-- 20240101000024_add_custom_reminder_days.sql
--
-- FR-19: lets an admin override the approver-reminder threshold for one specific
-- requirement, instead of every requirement on a shared routing_template being stuck
-- with that template's sla_days. NULL means "no override -- use the routing template's
-- sla_days", which is every existing row's behavior today, unchanged.
ALTER TABLE public.requirements
ADD COLUMN custom_reminder_days INTEGER;

ALTER TABLE public.requirements
ADD CONSTRAINT chk_custom_reminder_days_range
CHECK (
  custom_reminder_days IS NULL OR
  (custom_reminder_days >= 1 AND custom_reminder_days <= 30)
);
