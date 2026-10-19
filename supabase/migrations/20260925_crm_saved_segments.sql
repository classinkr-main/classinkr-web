-- CRM 저장 세그먼트(세그먼트 허브, C안 ②, 2026-09-25) + 일별 건수·자동 태그 실행 기록.
--
-- 평가는 앱(lib/repositories/crm-unified-customers.ts 통합 스냅샷 위 메모리 판정)이 한다. DB 는 조건과 결과만 담는다.
-- Compass crm 스키마에는 아무것도 쓰지 않는다. 자동 태그도 public.crm_customer_tags(Home 전용)에만 붙는다.
--
-- 미적용 환경: 허브 목록 GET 은 200 available:false(안내 배너), 쓰기는 503, 매일 자동 태그(디스패처 KST 06시 슬롯)는
-- skipped 로 강등한다(lib/repositories/crm-saved-segments.ts). 통합 목록·조건 칩·CSV 는 영향이 없다.
--
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE) — 재실행은 무해하다.

CREATE TABLE IF NOT EXISTS public.crm_saved_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- CustomerSegmentFilter 정규형. 키 이름 = URL 파라미터 이름, anyOf = OR 그룹(한 단계, 최대 5개).
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 조건 어휘 판. 앱이 모르는 판은 평가하지 않는다 — 구 배포가 새 키를 버려 조건이 넓어지는 사고를 막는다.
  spec_version SMALLINT NOT NULL DEFAULT 1,
  -- 정규형 쿼리 문자열의 sha256 앞 16자. 추이의 '조건 변경' 끊김을 표시하는 데 쓴다.
  spec_hash TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'mine',
  -- admin_profiles.user_id. 프로필이 지워져도 세그먼트는 남아야 하므로 FK 를 걸지 않는다(crm_region_assignments 관례).
  owner_user_id UUID,
  owner_name TEXT,
  auto_tag_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_tag_label TEXT,
  auto_untag BOOLEAN NOT NULL DEFAULT false,
  last_count INTEGER,
  last_evaluated_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_detail JSONB,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_saved_segments_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT crm_saved_segments_description_check CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT crm_saved_segments_spec_check CHECK (jsonb_typeof(spec) = 'object'),
  CONSTRAINT crm_saved_segments_spec_version_check CHECK (spec_version >= 1),
  CONSTRAINT crm_saved_segments_visibility_check CHECK (visibility IN ('team', 'mine')),
  CONSTRAINT crm_saved_segments_auto_tag_label_check CHECK (
    auto_tag_label IS NULL OR char_length(auto_tag_label) BETWEEN 1 AND 40),
  -- 자동 태그는 팀 공유 + 라벨 있음 + 보관 안 됨일 때만 켤 수 있다.
  CONSTRAINT crm_saved_segments_auto_tag_check CHECK (
    NOT auto_tag_enabled OR (auto_tag_label IS NOT NULL AND visibility = 'team' AND archived_at IS NULL)),
  CONSTRAINT crm_saved_segments_last_count_check CHECK (last_count IS NULL OR last_count >= 0),
  CONSTRAINT crm_saved_segments_last_run_status_check CHECK (last_run_status IS NULL OR last_run_status IN (
    'off', 'applied', 'partial', 'failed', 'skipped_neo_stale', 'skipped_degraded', 'skipped_too_many',
    'skipped_spike', 'skipped_unreadable', 'skipped_time_budget'))
);

CREATE INDEX IF NOT EXISTS crm_saved_segments_active_idx
  ON public.crm_saved_segments (visibility, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS crm_saved_segments_owner_idx
  ON public.crm_saved_segments (owner_user_id)
  WHERE archived_at IS NULL;

-- 같은 라벨을 두 세그먼트가 자동으로 붙이면 한쪽의 떼기가 다른 쪽 회원의 라벨을 지운다 — 활성 자동 라벨은 하나만.
-- 앱이 normalizeTag 로 공백을 접어 저장하므로 lower 만 건다. 위반은 23505 → API 409.
CREATE UNIQUE INDEX IF NOT EXISTS crm_saved_segments_auto_tag_label_uidx
  ON public.crm_saved_segments (lower(auto_tag_label))
  WHERE auto_tag_enabled AND archived_at IS NULL;

-- 수정 시각은 사람이 바꾼 값(이름·조건·공유·자동 태그 설정·보관)이 달라질 때만 올린다. 매일 06시 크론의 실행 결과
-- (last_*) 갱신이 모든 세그먼트의 updated_at 을 같은 시각으로 덮어 '최근 수정' 순서가 무의미해지는 것을 막는다.
CREATE OR REPLACE FUNCTION public.crm_saved_segments_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.name, NEW.description, NEW.spec, NEW.spec_version, NEW.spec_hash, NEW.visibility, NEW.owner_user_id,
      NEW.owner_name, NEW.auto_tag_enabled, NEW.auto_tag_label, NEW.auto_untag, NEW.archived_at)
     IS DISTINCT FROM
     (OLD.name, OLD.description, OLD.spec, OLD.spec_version, OLD.spec_hash, OLD.visibility, OLD.owner_user_id,
      OLD.owner_name, OLD.auto_tag_enabled, OLD.auto_tag_label, OLD.auto_untag, OLD.archived_at) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_saved_segments_updated_at ON public.crm_saved_segments;
CREATE TRIGGER crm_saved_segments_updated_at
  BEFORE UPDATE ON public.crm_saved_segments
  FOR EACH ROW EXECUTE FUNCTION public.crm_saved_segments_touch_updated_at();

-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다(아래 일별 표와 같다). 앱은 전부 service role API
-- (lib/repositories/crm-saved-segments.ts)로만 접근하고, '내 것은 소유자만'·'자동 태그 켜기·끄기는 관리자만'·보관(물리
-- 삭제 없음)은 API 가 강제한다. is_active_admin() 정책을 열어 두면 역할과 무관하게 활성 관리자 누구나 로그인 세션
-- (publishable key + JWT)으로 PostgREST 를 직접 불러 남의 '내 것'을 읽고, 자동 태그를 켜고, 세그먼트를 지워 일별 기록까지
-- 연쇄 삭제할 수 있다. 예전 정책이 이미 만들어진 환경은 아래 DROP 이 지운다(재실행 무해).
ALTER TABLE public.crm_saved_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM saved segments" ON public.crm_saved_segments;

-- 일별 건수 + 자동 태그 실행 기록(하루 한 행). 크론과 수동 실행이 upsert 하고, 같은 날 다시 돌리면 덮어쓴다(멱등).
CREATE TABLE IF NOT EXISTS public.crm_saved_segment_daily (
  segment_id UUID NOT NULL REFERENCES public.crm_saved_segments(id) ON DELETE CASCADE,
  -- KST 일자
  snapshot_date DATE NOT NULL,
  total INTEGER NOT NULL,
  lead_count INTEGER NOT NULL DEFAULT 0,
  neo_account_count INTEGER NOT NULL DEFAULT 0,
  customer_count INTEGER NOT NULL DEFAULT 0,
  -- 평가 당시 조건. 세그먼트의 현재 hash 와 다르면 '조건 변경 전' 점이다.
  spec_hash TEXT NOT NULL,
  flags TEXT[] NOT NULL DEFAULT '{}',
  auto_tag_status TEXT NOT NULL DEFAULT 'off',
  tagged INTEGER NOT NULL DEFAULT 0,
  untagged INTEGER NOT NULL DEFAULT 0,
  tag_failed INTEGER NOT NULL DEFAULT 0,
  run_trigger TEXT NOT NULL DEFAULT 'cron',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, snapshot_date),
  CONSTRAINT crm_saved_segment_daily_counts_check CHECK (
    total >= 0 AND lead_count >= 0 AND neo_account_count >= 0 AND customer_count >= 0
    AND tagged >= 0 AND untagged >= 0 AND tag_failed >= 0
    AND total = lead_count + neo_account_count + customer_count),
  CONSTRAINT crm_saved_segment_daily_flags_check CHECK (
    flags <@ ARRAY['compass_down', 'compass_partial', 'source_incomplete', 'neo_stale', 'truncated']::TEXT[]),
  CONSTRAINT crm_saved_segment_daily_status_check CHECK (auto_tag_status IN (
    'off', 'applied', 'partial', 'failed', 'skipped_neo_stale', 'skipped_degraded', 'skipped_too_many',
    'skipped_spike', 'skipped_unreadable', 'skipped_time_budget')),
  CONSTRAINT crm_saved_segment_daily_trigger_check CHECK (run_trigger IN ('cron', 'manual'))
);

-- PK 선행 컬럼 segment_id 가 세그먼트별 날짜 범위 조회를 덮으므로 별도 인덱스는 두지 않는다.
-- 보존 삭제(snapshot_date < 오늘-180)는 하루 한 번 작은 표를 훑는다 — 인덱스 없이 충분하다.
-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다(meta_insights_daily·ad_channel_daily 관례).
ALTER TABLE public.crm_saved_segment_daily ENABLE ROW LEVEL SECURITY;

-- 자동 태그 떼기용: 마커 행 조회는 created_by = 'auto:seg:<id>' 동등 조건 + id 정렬(range 페이지네이션)이다.
-- 부분 인덱스(WHERE created_by LIKE 'auto:%')는 플래너가 "= 상수 ⇒ LIKE 술어"를 증명하지 못해(LIKE 는 btree 연산자가
-- 아니다) 쓰이지 않으므로, 동등 조건과 정렬을 그대로 덮는 (created_by, id) 일반 인덱스를 둔다. 선택 사항이며 표가 작아
-- 없어도 동작한다. 예전 부분 인덱스가 이미 만들어진 환경은 지운다(재실행 무해).
DROP INDEX IF EXISTS public.crm_customer_tags_auto_created_by_idx;
CREATE INDEX IF NOT EXISTS crm_customer_tags_created_by_idx
  ON public.crm_customer_tags (created_by, id);
