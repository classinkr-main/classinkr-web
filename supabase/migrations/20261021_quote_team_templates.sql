-- 견적 팀 템플릿(2026-10-21) — 영업팀이 저장한 견적 구성(품목·기본 수량·단가 덮어쓰기·기본 조건·메모 문구).
--
-- 기본 템플릿은 코드 상수(lib/standard-quote-template.ts STANDARD_QUOTE_TEMPLATES)다. 이 표는 팀이 만든 것만 담는다.
-- 견적 1장 = 공급자 1곳: product_line 이 공급자를 정한다(software=클래스인, hardware=퀴드러닝). 품목이 같은 줄인지는
-- 앱(lib/quote-team-templates.ts validateQuoteTemplateInput)이 카탈로그로 검사한다.
--
-- 미적용 환경: 설정 화면·목록 API 는 기본 템플릿만 보여 주고(available:false 안내), 쓰기는 503 이다
-- (lib/repositories/quote-team-templates.ts).
--
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE) — 재실행은 무해하다.

CREATE TABLE IF NOT EXISTS public.quote_team_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product_line TEXT NOT NULL,
  -- 복제해 온 기본 템플릿 id(StandardQuoteTemplateId). 작성기가 옵션 그룹을 빌려 온다. 새로 만든 것은 NULL.
  source_template_id TEXT,
  -- [{ sku, quantity, unitPrice|null }] — unitPrice null = 카탈로그 정가.
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { validityDays, vat, installation, payment, notePresetIds[] }
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  scope TEXT NOT NULL DEFAULT 'mine',
  show_in_menu BOOLEAN NOT NULL DEFAULT false,
  -- admin_profiles.user_id. 프로필이 지워져도 템플릿은 남아야 하므로 FK 를 걸지 않는다(crm_saved_segments 관례).
  owner_user_id UUID,
  owner_name TEXT,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quote_team_templates_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT quote_team_templates_product_line_check CHECK (product_line IN ('hardware', 'software')),
  CONSTRAINT quote_team_templates_items_check CHECK (
    jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 30),
  CONSTRAINT quote_team_templates_defaults_check CHECK (jsonb_typeof(defaults) = 'object'),
  CONSTRAINT quote_team_templates_scope_check CHECK (scope IN ('mine', 'team'))
);

CREATE INDEX IF NOT EXISTS quote_team_templates_active_idx
  ON public.quote_team_templates (product_line, updated_at DESC)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS quote_team_templates_updated_at ON public.quote_team_templates;
CREATE TRIGGER quote_team_templates_updated_at
  BEFORE UPDATE ON public.quote_team_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다(crm_saved_segments 관례). 앱은 전부 service role API
-- (/api/admin/quote-templates)로만 접근하고 '나만은 소유자만'·'수정은 소유자 또는 관리자(팀 템플릿)'를 API 가 강제한다.
ALTER TABLE public.quote_team_templates ENABLE ROW LEVEL SECURITY;
