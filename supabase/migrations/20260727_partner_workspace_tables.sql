-- 파트너 워크스페이스(/admin/partners) 실사용 테이블 10종 복원.
--
-- 배경: lib/partners-data.ts 는 아래 10개 테이블을 select/insert/update 하지만,
-- 이 테이블들의 CREATE 문은 git 역사 어디에도 없다. 동작하던 환경은 SQL Editor 에서
-- 수동 생성한 것이고 그 SQL 은 유실됐다. 현재 프로덕션에는 10개 전부 부재이며
-- (to_regclass 전수 확인), 그 결과 querySupabasePartnerWorkspaces() 가 매번 throw 해
-- data/partners-workspaces.json 로컬 폴백으로 조용히 떨어진다.
-- 20260611_partners_workspace_columns.sql 이 partners 컬럼에 대해 했던 복원과 동일한 성격.
--
-- 스키마 출처: docs/admin-partners-supabase-schema.sql(2026-04-03 초안)을 기준으로 삼되,
-- 초안과 현재 코드가 어긋나는 지점은 전부 **코드의 실사용 계약**을 따랐다.
-- 초안을 그대로 적용하면 아래가 런타임에 깨진다:
--   * partner_ops_issues.status  : 초안 enum 은 'waiting_confirmation', 코드는 'waiting' 을 씀
--   * partner_sales_records.sales_month : 초안은 date, 코드는 'YYYY-MM'(7자) 문자열을 씀
--   * partner_activity_logs.subject_id  : 초안은 uuid, 코드는 검증 없는 자유 입력 문자열을 씀
--   * log_category / category / subject_type : 초안은 enum, 코드/UI 는 자유 텍스트를 씀
--                                              (UI 기본값 'general', '운영' 은 초안 enum 에 없음)
--
-- ENUM 대신 TEXT + CHECK 을 쓴 이유:
--   1) 가장 최근 파트너 마이그레이션(20260611)이 partners.channel 을 TEXT+CHECK 로 복원했다.
--   2) 초안의 타입명 partner_status 는 라이브에 이미 존재하지만 라벨이 전혀 다르다
--      (라이브: active/inactive/pending — 20260402 가 만든 것). 초안 enum 을 IF NOT EXISTS 로
--      만들면 조용히 스킵돼 잘못된 라벨 집합에 묶인다.
--   3) 값 집합이 바뀔 때 ALTER TYPE 없이 마이그레이션으로 처리 가능하다.
-- CHECK 의 값 목록은 전부 lib/partners-data.ts 상단 상수(DEAL_STAGES 등)에서 그대로 가져왔다.
--
-- 멱등성: 이 파일을 반복 실행해도 안전하다(CREATE TABLE/INDEX IF NOT EXISTS,
-- DROP TRIGGER IF EXISTS 후 CREATE, RLS enable 은 no-op). 단, 테이블이 "일부 컬럼만"
-- 존재하는 상태를 치료하지는 못한다 — 현재 프로덕션은 전부 부재이므로 해당 없음.
--
-- 보안: 10개 테이블 전부 어드민 전용이다(모든 접근이 createSupabaseAdminClient = service_role).
-- 20260423_rls_admin_only_tables.sql 컨벤션대로 RLS enable + 정책 0개 = deny-all.
-- service_role 은 RLS 를 우회하므로 앱 동작에는 영향이 없고, anon/authenticated 키가
-- 실수로 쓰여도 노출되지 않는다. GRANT 는 기존 파트너 마이그레이션 3개와 동일하게 두지 않는다.

-- ============================================================
-- A. 워크스페이스 테이블 10종
-- ============================================================

-- ─── partner_contacts ─────────────────────────────────────
-- partner_id: 파트너에 종속된 자식 → CASCADE.
CREATE TABLE IF NOT EXISTS public.partner_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  phone       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_deals ────────────────────────────────────────
-- stage 값: DEAL_STAGES (lib/partners-data.ts:42)
-- expected_close_at / contract_*_at 은 DATE — 라우트가 readOptionalDate 로
-- YYYY-MM-DD 만 통과시키고, 읽기는 formatDate() 로 앞 10자만 쓴다.
CREATE TABLE IF NOT EXISTS public.partner_deals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  stage              TEXT NOT NULL DEFAULT 'discovery'
                       CHECK (stage IN ('discovery', 'quoted', 'contract_sent', 'active', 'closed_won', 'closed_lost')),
  quote_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expected_close_at  DATE,
  contract_start_at  DATE,
  contract_end_at    DATE,
  sales_units        INTEGER NOT NULL DEFAULT 0,
  owner_name         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_documents ────────────────────────────────────
-- deal_id: 거래가 지워져도 문서(=회계 증빙)는 남아야 하는 교차 참조 → SET NULL.
-- archived_at: select 가 .is("archived_at", null) 로 거르는 소프트 삭제 컬럼.
-- metadata: quoteDetails(견적 상세 + lineItems)를 통째로 넣는 jsonb.
CREATE TABLE IF NOT EXISTS public.partner_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id           UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('quote', 'contract', 'receipt')),
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'signed', 'paid', 'overdue', 'archived')),
  title             TEXT NOT NULL,
  document_number   TEXT,
  source_file_name  TEXT,
  file_path         TEXT,
  external_url      TEXT,
  amount            NUMERIC(14, 2),
  issued_at         DATE,
  due_at            DATE,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ
);

-- ─── partner_document_deliveries ──────────────────────────
-- 현재 코드에서는 읽기 전용(insert/update 경로 없음). 컬럼은 select 목록과
-- normalize 기본값(allow_* = true, password_enabled = false, view_count = 0)에서 역산.
-- partner_document_id: 발송은 문서에 종속 → CASCADE.
-- partner_id: 비정규화된 소유자 키(파트너 단위 필터에 직접 씀) → CASCADE.
CREATE TABLE IF NOT EXISTS public.partner_document_deliveries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_document_id  UUID NOT NULL REFERENCES public.partner_documents(id) ON DELETE CASCADE,
  partner_id           UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  delivery_channel     TEXT NOT NULL DEFAULT 'link' CHECK (delivery_channel IN ('pdf', 'kakao', 'link')),
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'ready', 'sent', 'opened', 'expired', 'revoked', 'failed')),
  recipient_name       TEXT,
  recipient_email      TEXT,
  recipient_phone      TEXT,
  expires_at           TIMESTAMPTZ,
  password_enabled     BOOLEAN NOT NULL DEFAULT false,
  allow_download       BOOLEAN NOT NULL DEFAULT true,
  allow_print          BOOLEAN NOT NULL DEFAULT true,
  sent_at              TIMESTAMPTZ,
  last_viewed_at       TIMESTAMPTZ,
  view_count           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_schedule_items ───────────────────────────────
-- sync_to_admin_calendar: select 목록에는 없지만 lib/calendar-data.ts:307-309 가
-- 조회·필터에 쓴다. 기본 true(코드도 `?? true` 로 읽음).
CREATE TABLE IF NOT EXISTS public.partner_schedule_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id              UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id                 UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  kind                    TEXT NOT NULL CHECK (kind IN ('meeting', 'follow_up', 'deadline', 'renewal')),
  status                  TEXT NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned', 'completed', 'canceled')),
  title                   TEXT NOT NULL,
  starts_at               TIMESTAMPTZ NOT NULL,
  ends_at                 TIMESTAMPTZ,
  owner_name              TEXT,
  sync_to_admin_calendar  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_sales_records ────────────────────────────────
-- sales_month 은 DATE 가 아니라 TEXT 'YYYY-MM' 이다.
--   쓰기: app/api/admin/partners/[id]/sales/route.ts → readRequiredMonth() 가
--        항상 7자 'YYYY-MM' 을 돌려주고(_validation.ts:299-308), partners-data 는 그대로 insert.
--   읽기: formatDate() 가 YYYY-MM-DD 패턴에 안 맞으면 원문 반환 → 'YYYY-MM' 그대로 사용,
--        buildPartnerWorkspaceShell 의 salesMonth.startsWith('YYYY-MM') 비교도 이 형태를 전제.
--   DATE 로 만들면 '2026-07'::date 가 22007 로 에러 나 모든 실적 등록이 실패한다(프로덕션 확인).
-- CHECK 은 혹시 남아 있는 YYYY-MM-DD 경로도 통과하도록 뒤 3자를 선택으로 뒀다.
CREATE TABLE IF NOT EXISTS public.partner_sales_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  sales_month   TEXT NOT NULL CHECK (sales_month ~ '^\d{4}-\d{2}(-\d{2})?$'),
  units_sold    INTEGER NOT NULL DEFAULT 0,
  gross_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_amount    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_automations ──────────────────────────────────
-- 현재 코드에서는 읽기 전용(insert/update 경로 없음).
CREATE TABLE IF NOT EXISTS public.partner_automations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  trigger_type  TEXT NOT NULL,
  action_type   TEXT NOT NULL,
  destination   TEXT,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_ops_checklist_items ──────────────────────────
-- parent_item_id: 상위 항목이 지워지면 하위도 의미를 잃는 계층 소유 관계 → CASCADE.
--   (deal_id/document_id 류 교차 참조와 성격이 다름. ensureSupabaseChecklistOwnership 이
--    부모가 같은 partner 소속인지 앱에서 검증한다.)
-- sort_order: select 목록에 없고 insert 도 안 하지만 .order("sort_order") 가 1차 정렬키다
--             (lib/partners-data.ts:839). 없으면 조회 자체가 실패한다.
-- due_at / completed_at 은 DATE 가 아니라 TIMESTAMPTZ — toStorageDateTime() 이
-- 'YYYY-MM-DDTHH:mm' 을 쓰고 읽기는 formatDateTime() 으로 분 단위까지 표시한다.
CREATE TABLE IF NOT EXISTS public.partner_ops_checklist_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id             UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  parent_item_id      UUID REFERENCES public.partner_ops_checklist_items(id) ON DELETE CASCADE,
  checklist_group     TEXT NOT NULL,
  title               TEXT NOT NULL,
  item_category       TEXT,
  item_code           TEXT,
  item_name           TEXT,
  planned_quantity    INTEGER,
  confirmed_quantity  INTEGER,
  todo_status         TEXT NOT NULL DEFAULT 'open'
                        CHECK (todo_status IN ('open', 'waiting_partner', 'waiting_internal', 'blocked', 'done', 'canceled')),
  install_status      TEXT NOT NULL DEFAULT 'planned'
                        CHECK (install_status IN ('planned', 'ordered', 'delivered', 'installed', 'verified', 'issue')),
  owner_name          TEXT,
  due_at              TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_ops_issues ───────────────────────────────────
-- status 값: ISSUE_STATUSES (lib/partners-data.ts:67) = open/waiting/blocked/resolved.
--   docs 초안의 waiting_confirmation/dropped 이 아니다. 초안대로 만들면 'waiting' 저장이 실패한다.
-- category: UI 가 자유 입력(기본값 '운영')이라 enum 불가 → TEXT NOT NULL.
-- facts / unresolved_points / current_assumption / verify_with 는 배열이 아니라 **단일 TEXT**다.
--   PartnerOpsIssue 의 해당 필드는 `string | undefined`(lib/partners-types.ts),
--   normalizeIssue 가 toOptionalString() 을 쓰고, insert 도 `input.facts ?? null` 로 스칼라를 보낸다.
--   UI 도 textarea 단일 입력. text[]/jsonb 로 만들면 안 된다.
-- related_document_id / related_checklist_item_id: 교차 참조 → SET NULL(이슈 자체는 보존).
-- .order("updated_at") 가 정렬키이므로 updated_at 트리거가 필수다.
CREATE TABLE IF NOT EXISTS public.partner_ops_issues (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                 UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id                    UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  related_document_id        UUID REFERENCES public.partner_documents(id) ON DELETE SET NULL,
  related_checklist_item_id  UUID REFERENCES public.partner_ops_checklist_items(id) ON DELETE SET NULL,
  title                      TEXT NOT NULL,
  category                   TEXT NOT NULL,
  severity                   TEXT NOT NULL DEFAULT 'medium'
                               CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status                     TEXT NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'waiting', 'blocked', 'resolved')),
  facts                      TEXT,
  unresolved_points          TEXT,
  current_assumption         TEXT,
  verify_with                TEXT,
  owner_name                 TEXT,
  next_check_at              TIMESTAMPTZ,
  due_at                     TIMESTAMPTZ,
  resolved_at                TIMESTAMPTZ,
  resolution_summary         TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── partner_activity_logs ────────────────────────────────
-- subject_id 는 uuid 가 아니라 TEXT 다: 라우트가 readOptionalString 으로만 받고(UUID 검증 없음),
--   UI 는 자유 텍스트 인풋이다(PartnerWorkspaceDetailClient.tsx:1270).
-- log_category 도 자유 텍스트(UI 기본값 'general' — docs 초안 enum 에 없는 값).
-- subject_type 기본값 'partner'(insert 가 `input.subjectType ?? "partner"`).
-- deal_id/document_id/schedule_item_id/checklist_item_id/issue_id 는 전부 교차 참조 →
--   대상이 지워져도 감사 기록은 남아야 하므로 SET NULL.
CREATE TABLE IF NOT EXISTS public.partner_activity_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  deal_id           UUID REFERENCES public.partner_deals(id) ON DELETE SET NULL,
  document_id       UUID REFERENCES public.partner_documents(id) ON DELETE SET NULL,
  schedule_item_id  UUID REFERENCES public.partner_schedule_items(id) ON DELETE SET NULL,
  checklist_item_id UUID REFERENCES public.partner_ops_checklist_items(id) ON DELETE SET NULL,
  issue_id          UUID REFERENCES public.partner_ops_issues(id) ON DELETE SET NULL,
  subject_type      TEXT NOT NULL DEFAULT 'partner',
  subject_id        TEXT,
  log_category      TEXT NOT NULL DEFAULT 'operations_internal',
  status            TEXT NOT NULL DEFAULT 'recorded'
                      CHECK (status IN ('recorded', 'follow_up_needed', 'waiting_partner', 'waiting_internal', 'blocked', 'resolved', 'canceled')),
  actor_name        TEXT,
  action            TEXT NOT NULL,
  summary           TEXT NOT NULL,
  details           TEXT,
  next_action       TEXT,
  due_at            TIMESTAMPTZ,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 인덱스 — partner_id + 실제 정렬/필터 컬럼 기준
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner_id
  ON public.partner_contacts (partner_id);
-- .order("is_primary", desc).order("name") + .eq("is_primary", true) 조회용
CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner_primary
  ON public.partner_contacts (partner_id, is_primary DESC, name);

CREATE INDEX IF NOT EXISTS idx_partner_deals_partner_id
  ON public.partner_deals (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_deals_created_at
  ON public.partner_deals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_deals_stage
  ON public.partner_deals (stage);

CREATE INDEX IF NOT EXISTS idx_partner_documents_partner_id
  ON public.partner_documents (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_documents_deal_id
  ON public.partner_documents (deal_id);
CREATE INDEX IF NOT EXISTS idx_partner_documents_status
  ON public.partner_documents (status);
CREATE INDEX IF NOT EXISTS idx_partner_documents_document_number
  ON public.partner_documents (document_number);
-- 목록 조회 그대로: archived_at IS NULL + issued_at DESC
CREATE INDEX IF NOT EXISTS idx_partner_documents_active_issued_at
  ON public.partner_documents (partner_id, issued_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_document_deliveries_document_id
  ON public.partner_document_deliveries (partner_document_id);
CREATE INDEX IF NOT EXISTS idx_partner_document_deliveries_partner_created_at
  ON public.partner_document_deliveries (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_schedule_items_partner_id
  ON public.partner_schedule_items (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_schedule_items_deal_id
  ON public.partner_schedule_items (deal_id);
CREATE INDEX IF NOT EXISTS idx_partner_schedule_items_starts_at
  ON public.partner_schedule_items (starts_at);
-- lib/calendar-data.ts 의 "월을 걸치는 일정" 두 번째 쿼리(.gte("ends_at", ...))용
CREATE INDEX IF NOT EXISTS idx_partner_schedule_items_ends_at
  ON public.partner_schedule_items (ends_at);
-- 어드민 캘린더 월 조회: status='planned' AND sync_to_admin_calendar
CREATE INDEX IF NOT EXISTS idx_partner_schedule_items_admin_calendar
  ON public.partner_schedule_items (starts_at)
  WHERE status = 'planned' AND sync_to_admin_calendar;

CREATE INDEX IF NOT EXISTS idx_partner_sales_records_partner_id
  ON public.partner_sales_records (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_sales_records_sales_month
  ON public.partner_sales_records (sales_month DESC);

CREATE INDEX IF NOT EXISTS idx_partner_automations_partner_id
  ON public.partner_automations (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_automations_created_at
  ON public.partner_automations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_ops_checklist_items_partner_id
  ON public.partner_ops_checklist_items (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_ops_checklist_items_deal_id
  ON public.partner_ops_checklist_items (deal_id);
CREATE INDEX IF NOT EXISTS idx_partner_ops_checklist_items_parent_item_id
  ON public.partner_ops_checklist_items (parent_item_id);
-- .order("sort_order").order("created_at") 정렬 그대로
CREATE INDEX IF NOT EXISTS idx_partner_ops_checklist_items_sort
  ON public.partner_ops_checklist_items (partner_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_partner_ops_issues_partner_id
  ON public.partner_ops_issues (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_ops_issues_deal_id
  ON public.partner_ops_issues (deal_id);
CREATE INDEX IF NOT EXISTS idx_partner_ops_issues_updated_at
  ON public.partner_ops_issues (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_ops_issues_related_document_id
  ON public.partner_ops_issues (related_document_id);
CREATE INDEX IF NOT EXISTS idx_partner_ops_issues_related_checklist_item_id
  ON public.partner_ops_issues (related_checklist_item_id);

CREATE INDEX IF NOT EXISTS idx_partner_activity_logs_partner_id
  ON public.partner_activity_logs (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_activity_logs_partner_occurred_at
  ON public.partner_activity_logs (partner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_activity_logs_occurred_at
  ON public.partner_activity_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_activity_logs_deal_id
  ON public.partner_activity_logs (deal_id);
CREATE INDEX IF NOT EXISTS idx_partner_activity_logs_document_id
  ON public.partner_activity_logs (document_id);
CREATE INDEX IF NOT EXISTS idx_partner_activity_logs_issue_id
  ON public.partner_activity_logs (issue_id);

-- ============================================================
-- updated_at 트리거
-- 20260402/20260404 가 만든 public.update_updated_at() 재사용(라이브 존재 확인).
-- docs 초안의 set_updated_at() 은 라이브에 없으므로 쓰지 않는다.
-- CREATE TRIGGER 에는 IF NOT EXISTS 가 없어 DROP IF EXISTS 로 가드한다.
-- ============================================================

DROP TRIGGER IF EXISTS partner_contacts_updated_at ON public.partner_contacts;
CREATE TRIGGER partner_contacts_updated_at
  BEFORE UPDATE ON public.partner_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_deals_updated_at ON public.partner_deals;
CREATE TRIGGER partner_deals_updated_at
  BEFORE UPDATE ON public.partner_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_documents_updated_at ON public.partner_documents;
CREATE TRIGGER partner_documents_updated_at
  BEFORE UPDATE ON public.partner_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_document_deliveries_updated_at ON public.partner_document_deliveries;
CREATE TRIGGER partner_document_deliveries_updated_at
  BEFORE UPDATE ON public.partner_document_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_schedule_items_updated_at ON public.partner_schedule_items;
CREATE TRIGGER partner_schedule_items_updated_at
  BEFORE UPDATE ON public.partner_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_sales_records_updated_at ON public.partner_sales_records;
CREATE TRIGGER partner_sales_records_updated_at
  BEFORE UPDATE ON public.partner_sales_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_automations_updated_at ON public.partner_automations;
CREATE TRIGGER partner_automations_updated_at
  BEFORE UPDATE ON public.partner_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_ops_checklist_items_updated_at ON public.partner_ops_checklist_items;
CREATE TRIGGER partner_ops_checklist_items_updated_at
  BEFORE UPDATE ON public.partner_ops_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- partner_ops_issues 는 .order("updated_at", desc) 가 목록 정렬키라 트리거가 기능 요구사항이다.
DROP TRIGGER IF EXISTS partner_ops_issues_updated_at ON public.partner_ops_issues;
CREATE TRIGGER partner_ops_issues_updated_at
  BEFORE UPDATE ON public.partner_ops_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS partner_activity_logs_updated_at ON public.partner_activity_logs;
CREATE TRIGGER partner_activity_logs_updated_at
  BEFORE UPDATE ON public.partner_activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- RLS — deny-all 기본(정책 0개). 20260423_rls_admin_only_tables.sql 컨벤션.
-- 모든 접근은 service role(createSupabaseAdminClient)로만 이뤄진다.
-- 파트너 포털(V2)은 이 테이블들을 읽지 않는다(partner_accounts/deals 계열을 씀).
-- 나중에 파트너 SSR 읽기가 필요해지면 이 파일에 정책을 추가한다.
-- ============================================================

ALTER TABLE public.partner_contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_deals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_document_deliveries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_schedule_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_sales_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_automations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_ops_checklist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_ops_issues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_activity_logs         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- B. partners 선행 컬럼 (분리 적용 가능)
--
-- 위 10개 테이블만 만들어서는 기능이 살아나지 않는다.
-- querySupabasePartnerWorkspaces() 의 첫 쿼리가 partners 에 대해
-- .is("archived_at", null) 을 거는데(lib/partners-data.ts:802) 라이브 partners 에는
-- archived_at 이 없다 → partnersError 로 전체 Promise.all 이 throw → 지금처럼 로컬 폴백.
-- createSupabasePartner() 도 code 를 insert 하는데(:1598) 그 컬럼이 없어 파트너 생성이 실패한다.
-- 둘 다 순수 추가(additive)라 기존 1행에 영향이 없다.
-- 이 섹션만 별도 마이그레이션으로 떼고 싶으면 아래 블록을 그대로 옮기면 된다.
--
-- 주의: docs 초안은 code 를 `not null` + unique 로 뒀지만, 기존 행이 code 없이
-- 존재하므로 여기서는 nullable/비유니크로만 추가한다. 유니크 강제는 백필 후 별도 결정.
-- ============================================================

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS code TEXT;

CREATE INDEX IF NOT EXISTS idx_partners_active
  ON public.partners (name)
  WHERE archived_at IS NULL;
