-- CRM 태그 정의 + 자동 태그 규칙(§11.3 T5·T6, 2026-09-22).
--
-- crm_customer_tags(수십만 행 규모 예상)에는 컬럼을 얹지 않고, 태그 "정의"(범주·자동 여부·설명)를
-- 별도 소규모 테이블로 둔다. 자동 태그 규칙은 조건(만료 임박·건강도 위험·휴면)을 저장하고
-- 일 1회 cron(app/api/cron/crm-auto-tags)이 이 표를 읽어 crm_customer_tags 를 갱신한다.
--
-- T6 결정: 색 컬럼은 추가하지 않는다(DESIGN.md 가 범주 색을 제한). category 만 5종 enum으로 둔다.

CREATE TABLE IF NOT EXISTS public.crm_tag_definitions (
  -- 정규화 표기(트림·공백 정리) 그대로를 PK로 쓴다 — crm_customer_tags.tag 와 같은 문자열 규약.
  tag TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'manual'
    CHECK (category IN ('segment', 'stage', 'risk', 'product', 'manual')),
  description TEXT,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS crm_tag_definitions_updated_at ON public.crm_tag_definitions;
CREATE TRIGGER crm_tag_definitions_updated_at
  BEFORE UPDATE ON public.crm_tag_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- deny-all 관례(20260423_rls_admin_only_tables.sql) — 이 저장소의 모든 접근은
-- service role(createSupabaseAdminClient) 경유다. anon/authenticated 정책을 만들지 않는다.
ALTER TABLE public.crm_tag_definitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.crm_tag_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL,
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('expiring_within_days', 'health_risk', 'dormant_days')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_types TEXT[] NOT NULL DEFAULT '{neo_account}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_applied INT,
  last_removed INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 같은 태그·규칙 유형 조합은 하나만 — 시드 INSERT 의 ON CONFLICT 대상이자, 관리 화면에서
  -- "이 태그의 이 조건은 이미 있다"를 DB 레벨에서 보장한다.
  CONSTRAINT crm_tag_rules_tag_rule_type_key UNIQUE (tag, rule_type)
);

DROP TRIGGER IF EXISTS crm_tag_rules_updated_at ON public.crm_tag_rules;
CREATE TRIGGER crm_tag_rules_updated_at
  BEFORE UPDATE ON public.crm_tag_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_tag_rules ENABLE ROW LEVEL SECURITY;

-- 기본 규칙 2개 시드: 재계약(만료 30일 이내) · 이탈위험(건강도 위험 밴드). 둘 다 대상은
-- neo_account(활성 고객)만 — target_types 컬럼 기본값 그대로.
INSERT INTO public.crm_tag_rules (tag, rule_type, params, target_types)
VALUES
  ('재계약', 'expiring_within_days', '{"days": 30}'::jsonb, '{neo_account}'),
  ('이탈위험', 'health_risk', '{}'::jsonb, '{neo_account}')
ON CONFLICT (tag, rule_type) DO NOTHING;

-- 두 자동 태그의 정의도 함께 시드(is_auto=true). 사람이 이후 범주를 바꿔도(set_category)
-- is_auto 는 규칙 존재 여부로만 화면이 재계산하지 않고 이 컬럼을 그대로 신뢰한다.
INSERT INTO public.crm_tag_definitions (tag, category, description, is_auto)
VALUES
  ('재계약', 'stage', '만료 30일 이내 자동 부여(규칙: expiring_within_days)', true),
  ('이탈위험', 'risk', '건강도 위험 밴드 자동 부여(규칙: health_risk)', true)
ON CONFLICT (tag) DO NOTHING;

-- crm_customer_tags: 자동/수기 구분. 기존 행은 전부 사람이 붙인 것이므로 기본값 'manual'이
-- 곧 백필이다(별도 이관 스크립트 불필요).
ALTER TABLE public.crm_customer_tags
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto'));
