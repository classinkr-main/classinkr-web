-- partners.status: enum partner_status(active/inactive/pending) → TEXT + CHECK.
--
-- 라이브 컬럼은 20260402_partner_portal.sql 이 만든 enum 을 그대로 쓰는데, 현재 코드
-- (lib/partners-data.ts PARTNER_STATUSES)의 값 집합은 lead/active/paused/churn_risk 다.
-- 그 결과 createSupabasePartner 의 status='lead' insert 가 invalid input value for enum
-- 으로 실패해 파트너 생성이 막히고, 읽기 쪽 normalizePartner 는 enum 값 inactive/pending
-- 을 조용히 'lead' 로 뭉갠다.
--
-- 전환 방식은 20260611_partners_workspace_columns.sql(channel TEXT+CHECK) 전례를 따른다.
-- ALTER TYPE ADD VALUE 가 아니라 TEXT 전환을 쓰는 이유는
-- 20260727_partner_workspace_tables.sql 상단 주석과 동일 — 값 집합 변경을 이후에도
-- 마이그레이션만으로 처리할 수 있고, 라벨이 다른 동명 타입의 IF NOT EXISTS 함정을 없앤다.
--
-- 기존 행: 라이브 1행(status='active') — 'active' 는 양쪽 집합에 모두 있어 무손실.
-- 다른 환경에 남아 있을 수 있는 enum 라벨은 의미가 가장 가까운 값으로 매핑한다
-- (inactive=거래 중단 → paused, pending=아직 미활성 → lead).
--
-- 멱등성: 반복 실행 안전 — TEXT 컬럼에 대한 USING status::text 는 무해하고,
-- CHECK 는 DROP IF EXISTS 후 재생성한다. DROP TYPE 은 의존이 남아 있으면 실패하므로
-- 컬럼 전환 뒤 마지막에 둔다(라이브 확인: partner_status 의존 컬럼은 partners.status 뿐).

ALTER TABLE public.partners ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.partners
  ALTER COLUMN status TYPE TEXT USING status::text;

UPDATE public.partners SET status = 'paused' WHERE status = 'inactive';
UPDATE public.partners SET status = 'lead'   WHERE status = 'pending';

ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_status_check;
ALTER TABLE public.partners
  ADD CONSTRAINT partners_status_check
  CHECK (status IN ('lead', 'active', 'paused', 'churn_risk'));

-- 기본값은 코드의 기본(normalizePartner → 'lead')과 맞춘다.
-- 이전 기본 'active'::partner_status 는 enum 시절 산물이라 승계하지 않는다.
ALTER TABLE public.partners ALTER COLUMN status SET DEFAULT 'lead';

DROP TYPE IF EXISTS public.partner_status;
