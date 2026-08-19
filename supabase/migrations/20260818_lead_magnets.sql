-- 자료 퍼널(lead magnets) 저장소 Supabase 이관(2026-08-18).
-- 근거: 마케팅 탭 자체 평가 — 블로그는 2026-06 Supabase로 이관됐는데 자료 퍼널만
-- data/lead-magnets.json 파일 기반으로 남아, read-only 서버리스 런타임에서 쓰기가
-- 차단되고 다중 인스턴스 환경에서 쓰기 유실 위험이 있었다.
--
-- 문서 구조가 깊고(섹션·점수 밴드·워크시트·케이스 카드·세일즈 플레이북…) 정규화 로직이
-- 코드(normalizeLeadMagnet)에 이미 있으므로 행 = slug + 전체 JSONB 문서로 둔다.
-- 읽기 경로는 기존 정규화를 그대로 태워 JSON 모드와 결과가 동일하다.
-- 기존 데이터 이관: node --env-file=.env.local scripts/import-lead-magnets.mjs
CREATE TABLE IF NOT EXISTS public.lead_magnets (
  slug       TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL,
  -- data.published 미러 — 발행 목록 조회를 인덱스 없는 JSONB 스캔으로 하지 않기 위한 컬럼.
  published  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 — 20260724_marketing_campaigns.sql과 동일 함수 재사용(재정의 무해).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_magnets_updated_at ON public.lead_magnets;
CREATE TRIGGER trg_lead_magnets_updated_at
  BEFORE UPDATE ON public.lead_magnets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: admin/service-role 전용(deny-all 기본) — 공개 화면(/resources)도 서버 컴포넌트가
-- admin 클라이언트로 읽으므로 anon 정책이 필요 없다.
ALTER TABLE public.lead_magnets ENABLE ROW LEVEL SECURITY;
