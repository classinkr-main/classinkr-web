-- Link Admin accounts to internal CRM ownership and assignment.
-- This keeps the branch director and managers in admin_profiles as the
-- single account source, while CRM uses stable owner keys for filters/tasks.

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS crm_team_role TEXT NOT NULL DEFAULT 'manager'
    CHECK (crm_team_role IN ('branch_director', 'manager', 'admin', 'ops')),
  ADD COLUMN IF NOT EXISTS crm_assignable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS crm_owner_key TEXT,
  ADD COLUMN IF NOT EXISTS crm_owner_aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS neo_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS crm_sort_order INTEGER NOT NULL DEFAULT 100;

UPDATE public.admin_profiles
SET crm_owner_key = COALESCE(crm_owner_key, display_name)
WHERE crm_owner_key IS NULL;

UPDATE public.admin_profiles
SET crm_team_role = CASE
  WHEN role = 'BRANCH' THEN 'branch_director'
  WHEN role = 'SUPER_ADMIN' THEN 'admin'
  ELSE crm_team_role
END
WHERE crm_team_role = 'manager';

CREATE INDEX IF NOT EXISTS idx_admin_profiles_crm_assignable
  ON public.admin_profiles (crm_assignable, status, crm_team_role, crm_sort_order);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_crm_owner_key
  ON public.admin_profiles (crm_owner_key)
  WHERE crm_owner_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_profiles_neo_owner_id
  ON public.admin_profiles (neo_owner_id)
  WHERE neo_owner_id IS NOT NULL;

COMMENT ON COLUMN public.admin_profiles.branch_name IS
  'Branch/team label for branch directors and managers.';
COMMENT ON COLUMN public.admin_profiles.crm_team_role IS
  'Internal CRM operating role: branch_director, manager, admin, or ops.';
COMMENT ON COLUMN public.admin_profiles.crm_assignable IS
  'Whether this active admin can be assigned CRM customers, tasks, and events.';
COMMENT ON COLUMN public.admin_profiles.crm_owner_key IS
  'Stable CRM owner key used for filters and assignment. Defaults to display_name.';
COMMENT ON COLUMN public.admin_profiles.crm_owner_aliases IS
  'Additional owner names from sheets, legacy leads, or external CRM snapshots.';
COMMENT ON COLUMN public.admin_profiles.neo_owner_id IS
  'Optional Xiaoshouyi/NEO owner id for external CRM owner matching.';
COMMENT ON COLUMN public.admin_profiles.crm_sort_order IS
  'Display order for CRM owner pickers; branch director should sort before managers.';

NOTIFY pgrst, 'reload schema';
