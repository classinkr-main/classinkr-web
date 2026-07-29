-- 어드민 사이드바 접근·배치 저장소.
-- 스펙: docs/active/admin-tab-restructure-2026-07-29.md §5.1
--
-- 기존 capabilities(TEXT[])와 섞지 않는다 — capabilities는 hardware.finalize 같은 *동작* 권한이고
-- nav_*는 *표면 배치* 축이다. 한 배열에 넣으면 둘 다 읽기 어려워진다.
--
-- nav_preset이 NULL이면 애플리케이션이 기존 ADMIN_NAV[].roles 동작으로 폴백한다
-- (components/admin/admin-nav-access.ts resolveNavPlacement 첫 분기).
-- 따라서 이 마이그레이션만 적용해도 화면은 하나도 바뀌지 않는다 — 배포와 전환을 분리하는 안전장치다.

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS nav_preset TEXT,
  ADD COLUMN IF NOT EXISTS nav_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.admin_profiles
  DROP CONSTRAINT IF EXISTS admin_profiles_nav_preset_check;

ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_nav_preset_check
  CHECK (nav_preset IS NULL OR nav_preset IN ('staff','sales','marketing','cs','lead','branch','super'));

-- nav_overrides는 {"<href>": "primary|folded|deny"} 평면 객체만 허용한다.
-- 값 자체의 유효성은 애플리케이션(normalizeNavOverrides)이 한 번 더 거른다 —
-- 모르는 href나 오타 난 placement는 조용히 버려져 잘못된 설정이 화면을 깨뜨리지 않는다.
ALTER TABLE public.admin_profiles
  DROP CONSTRAINT IF EXISTS admin_profiles_nav_overrides_check;

ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_nav_overrides_check
  CHECK (jsonb_typeof(nav_overrides) = 'object');

COMMENT ON COLUMN public.admin_profiles.nav_preset IS
  '어드민 사이드바 프리셋 키. NULL이면 기존 role 기반 동작(무변화). docs/active/admin-tab-restructure-2026-07-29.md §5.2';
COMMENT ON COLUMN public.admin_profiles.nav_overrides IS
  '프리셋 대비 사람별 예외. {"/admin/crm":"primary"} 형태. 키=nav href, 값=primary|folded|deny.';
