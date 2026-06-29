-- CRM task spine: the first-class "what to do next" object for the internal CRM.
-- Promotes the temporary crm_customer_events.next_actions JSON into durable tasks
-- that can be completed, snoozed, reassigned, and rolled up per owner.
-- See docs/active/sales-crm-phase0-phase1-discussion-2026-06-27.md (§4.3, §5.1).

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (target_type IN ('lead', 'neo_account', 'customer', 'deal', 'unknown')),
  target_id TEXT,
  target_label TEXT,
  owner_key TEXT,
  owner_name_snapshot TEXT,
  task_type TEXT NOT NULL DEFAULT 'call'
    CHECK (task_type IN (
      'call',
      'kakao',
      'email',
      'meeting',
      'quote',
      'demo',
      'install',
      'renewal',
      'cs_checkin',
      'data_fix',
      'other'
    )),
  title TEXT NOT NULL,
  detail TEXT,
  due_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'snoozed', 'canceled')),
  source_event_id UUID REFERENCES public.crm_customer_events(id) ON DELETE SET NULL,
  created_by TEXT,
  assigned_by TEXT,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner accountability roll-ups: open / overdue tasks per owner.
CREATE INDEX IF NOT EXISTS crm_tasks_owner_idx
  ON public.crm_tasks (owner_key, status, due_at);

-- Home priority queue: today / overdue across all owners.
CREATE INDEX IF NOT EXISTS crm_tasks_status_due_idx
  ON public.crm_tasks (status, due_at);

-- Customer 360: open tasks for a given target.
CREATE INDEX IF NOT EXISTS crm_tasks_target_idx
  ON public.crm_tasks (target_type, target_id, status);

-- Resurfacing snoozed tasks.
CREATE INDEX IF NOT EXISTS crm_tasks_snoozed_idx
  ON public.crm_tasks (snoozed_until)
  WHERE status = 'snoozed';

-- Link back to the activity/event that spawned the task.
CREATE INDEX IF NOT EXISTS crm_tasks_source_event_idx
  ON public.crm_tasks (source_event_id);

DROP TRIGGER IF EXISTS crm_tasks_updated_at ON public.crm_tasks;
CREATE TRIGGER crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM tasks" ON public.crm_tasks;
CREATE POLICY "Admins manage CRM tasks"
  ON public.crm_tasks
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
