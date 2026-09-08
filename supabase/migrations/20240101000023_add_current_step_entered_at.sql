-- FR-19 digest bug fix: the daily digest was keying its SLA clock off `updated_at`,
-- which bumps on any write to the row (e.g. a reassignment, per REASSIGN in
-- submissions.ts) and not just on entering a new step. Give the SLA clock its own
-- column so unrelated writes stop silently resetting it.
ALTER TABLE public.submissions
  ADD COLUMN current_step_entered_at TIMESTAMPTZ;

-- Backfill: best-effort baseline using the existing updated_at. This will be wrong for
-- rows that were reassigned/edited after entering their current step, but it's no worse
-- than the pre-fix behavior for those rows, and every future step transition sets this
-- column explicitly and correctly.
UPDATE public.submissions
  SET current_step_entered_at = COALESCE(updated_at, created_at)
  WHERE current_step_entered_at IS NULL;
