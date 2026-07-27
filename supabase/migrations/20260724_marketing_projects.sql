-- ─────────────────────────────────────────────────────────────
-- 마케팅 프로젝트 묶음(D3) — marketing_campaigns 를 묶는 상위 개체
--
-- 목적:
-- D1(marketing_campaigns)로 통합한 크로스채널 캠페인들을 하나의 마케팅
-- 프로젝트(캠페인의 상위 묶음)로 그룹핑한다. 프로젝트는 멤버 캠페인들의 지표를
-- 읽기시점에 롤업하는 상위 우산이다(롤업 계산은 API 레이어 — 여기선 스키마만).
--
--   1) marketing_projects           — 프로젝트 개체(이름·목표·상태·기간·예산·담당)
--   2) marketing_campaigns.project_id FK — D1 에서 만든 bare nullable 컬럼에 FK 를 건다
--
-- 소속 관계: marketing_campaigns.project_id → marketing_projects.id.
-- ON DELETE SET NULL — 프로젝트 삭제 시 멤버 캠페인은 보존하고 소속만 해제한다
-- (캠페인은 프로젝트 없이도 1급 개체로 독립 존재).
--
-- 적용 순서: 20260724_marketing_campaigns.sql 이 먼저 적용된다(파일명 정렬상
-- campaigns < projects). 따라서 이 마이그레이션 시점에 marketing_campaigns 와
-- project_id 컬럼은 이미 존재한다.
-- ─────────────────────────────────────────────────────────────

-- ─── 1. 프로젝트 개체 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  objective   TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('planned', 'active', 'paused', 'done')),
  starts_at   DATE,
  ends_at     DATE,
  budget      BIGINT,                          -- KRW, nullable(프로젝트 배정 예산)
  owner       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. marketing_campaigns.project_id FK 추가 ───────────────
-- D1(20260724_marketing_campaigns.sql)에서 project_id 는 bare nullable UUID 컬럼으로만
-- 만들어졌다. 이제 marketing_projects 가 생겼으니 FK 를 건다.
-- ON DELETE SET NULL — 프로젝트 삭제 시 캠페인은 보존하고 소속만 해제.
-- bare ADD CONSTRAINT 는 재실행 시 42710(이미 존재)으로 실패하므로 pg_constraint 가드로
-- idempotent 하게 감싼다(sibling 20260718_branch_sales_ledger_draft_amount_positive.sql 패턴 —
-- conrelid+conname 으로 대상 테이블까지 특정: 제약명은 스키마가 아니라 테이블 단위로만 유일하므로
-- 다른 테이블의 동명 제약과 오탐 매칭되지 않도록 conrelid 로 좁힌다).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.marketing_campaigns'::regclass
      AND conname = 'marketing_campaigns_project_id_fkey'
  ) THEN
    ALTER TABLE public.marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.marketing_projects(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 인덱스 ──────────────────────────────────────────────────
-- 프로젝트별 멤버 캠페인 조회(listCampaignsByProject)·FK 조인을 위한 인덱스.
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_project
  ON public.marketing_campaigns (project_id);

-- ─── updated_at 자동 갱신 트리거 ─────────────────────────────
-- 20260326_automation.sql / 20260724_marketing_campaigns.sql 과 동일한 범용 함수
-- (CREATE OR REPLACE 로 idempotent·self-contained).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_projects_updated_at ON public.marketing_projects;
CREATE TRIGGER trg_marketing_projects_updated_at
  BEFORE UPDATE ON public.marketing_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS: admin/service-role 전용(deny-all 기본) ─────────────
-- 20260724_marketing_campaigns.sql 과 동일: RLS 를 ENABLE 하되 정책을 두지 않아
-- anon/authenticated 키는 차단, service_role(createSupabaseAdminClient)만 우회 접근한다.
-- 명시적 read 접근이 필요해지면 여기에 정책을 추가한다.
ALTER TABLE public.marketing_projects ENABLE ROW LEVEL SECURITY;
