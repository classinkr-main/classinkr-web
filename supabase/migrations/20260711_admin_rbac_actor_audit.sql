-- Admin OS identity/RBAC canon:
-- - Supabase admin_profiles is the production identity source.
-- - Exactly zero or one SUPER_ADMIN may exist; normal operation should keep one.
-- - Per-account capabilities supplement the coarse SUPER_ADMIN / BRANCH / ADMIN roles.
-- - Audit rows preserve actor identity snapshots even if the profile later changes.

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}';

-- 기존 세분 역할을 운영 결정의 3역할로 수렴한다. CRM 팀 역할이 지사장으로
-- 지정된 계정만 BRANCH, 나머지 EDITOR/VIEWER는 일반 ADMIN이 된다.
UPDATE public.admin_profiles
SET role = CASE
  WHEN crm_team_role = 'branch_director' THEN 'BRANCH'
  ELSE 'ADMIN'
END
WHERE role IN ('EDITOR', 'VIEWER');

CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_single_super_admin
  ON public.admin_profiles (role)
  WHERE role = 'SUPER_ADMIN';

CREATE INDEX IF NOT EXISTS idx_admin_profiles_capabilities
  ON public.admin_profiles USING GIN (capabilities);

-- 운영상 하드웨어 최종 승인자는 한 명만 둔다. SUPER_ADMIN의 암묵적 비상 권한은
-- capabilities 배열에 저장하지 않으므로 이 제약의 대상이 아니다.
CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_single_hardware_finalizer
  ON public.admin_profiles ((1))
  WHERE capabilities @> ARRAY['hardware.finalize']::TEXT[];

-- 기존 명시 권한을 먼저 정리한 뒤 이왕찬 계정에만 최종 승인 권한을 부여한다.
-- neo_owner_id는 이름 변경에도 유지되는 외부 CRM 식별자이며, display_name은
-- 마이그레이션 순서상 매핑 컬럼이 비어 있는 환경을 위한 제한적 보조 기준이다.
UPDATE public.admin_profiles
SET capabilities = array_remove(capabilities, 'hardware.finalize')
WHERE role <> 'SUPER_ADMIN';

UPDATE public.admin_profiles
SET capabilities = array_append(capabilities, 'hardware.finalize')
WHERE status = 'ACTIVE'
  AND role <> 'SUPER_ADMIN'
  AND NOT capabilities @> ARRAY['hardware.finalize']::TEXT[]
  AND (
    neo_owner_id = '3637154579422025'
    OR regexp_replace(lower(display_name), '\\s+', '', 'g') IN (
      '이왕찬',
      '왕찬',
      'leewangchan',
      'wangchan',
      'wangchanlee'
    )
  );

COMMENT ON COLUMN public.admin_profiles.capabilities IS
  'Explicit per-account capabilities such as hardware.finalize. SUPER_ADMIN has every capability implicitly.';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE user_id = auth.uid()
      AND status = 'ACTIVE'
      AND role = 'SUPER_ADMIN'
  );
$$;

DROP POLICY IF EXISTS "Admins update profiles" ON public.admin_profiles;
DROP POLICY IF EXISTS "Super admin updates profiles" ON public.admin_profiles;
CREATE POLICY "Super admin updates profiles"
  ON public.admin_profiles FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_display_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT;

COMMENT ON COLUMN public.audit_logs.actor_user_id IS
  'Stable auth.users id. Nullable only for development bypass or deleted historical identities.';
COMMENT ON COLUMN public.audit_logs.actor_display_name IS
  'Display-name snapshot at action time; never use as the stable identity key.';
COMMENT ON COLUMN public.audit_logs.actor_role IS
  'Role snapshot at action time.';

NOTIFY pgrst, 'reload schema';
