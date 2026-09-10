-- CRM 지역 분배(territory) — 시도 하나에 담당자 하나.
--
-- 왜 필요한가: lib/crm/lead-assignment-policy.ts 는 "권위 있는 owner 연결이 없으므로
-- 채널·지역·라운드로빈을 추측하지 않는다"는 이유로 자동 배정 후보를 구조적으로 0으로
-- 닫아 두었다. 실제로 프로덕션 리드 231건 전부가 assigned_to 비어 있다(2026-08-28 실측).
-- 이 표가 그 "권위 있는 연결"이다 — 사람이 정한 배정이지 추론이 아니다.
--
-- 이력: 한 시도에 활성 배정은 하나뿐이고(부분 유니크 인덱스), 교체는 이전 행의
-- effective_to 를 닫고 새 행을 넣는 방식이라 과거 담당자를 지우지 않는다.

CREATE TABLE IF NOT EXISTS public.crm_region_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 17개 시도 라벨(lib/regions/korea-regions.ts KOREA_PROVINCE_LABELS). 표기 정본은 앱이 강제한다.
  region_label TEXT NOT NULL,
  -- admin_profiles.crm_owner_key. 프로필이 지워져도 배정 이력은 남아야 하므로 FK 를 걸지 않는다.
  owner_key TEXT NOT NULL,
  -- 표시용 스냅샷. 이름이 바뀌어도 당시 기록을 읽을 수 있게 남긴다.
  owner_name TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  -- NULL = 현재 유효
  effective_to DATE,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_region_assignments_period_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- 활성 배정은 시도당 하나. 교체 경로가 이 제약을 어기면 라우팅이 두 사람을 가리킨다.
CREATE UNIQUE INDEX IF NOT EXISTS crm_region_assignments_active_region_idx
  ON public.crm_region_assignments (region_label)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS crm_region_assignments_owner_idx
  ON public.crm_region_assignments (owner_key)
  WHERE effective_to IS NULL;

DROP TRIGGER IF EXISTS crm_region_assignments_updated_at ON public.crm_region_assignments;
CREATE TRIGGER crm_region_assignments_updated_at
  BEFORE UPDATE ON public.crm_region_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_region_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM region assignments" ON public.crm_region_assignments;
CREATE POLICY "Admins manage CRM region assignments"
  ON public.crm_region_assignments
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
