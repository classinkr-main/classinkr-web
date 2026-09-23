-- ─────────────────────────────────────────────────────────────
-- 네이버 검색광고 유입 귀속 — leads.naver_ad (JSONB)
--
-- 네이버는 프리미엄 로그분석이 연동된 계정의 광고 클릭에 n_* 파라미터를 랜딩 URL로
-- 붙여 보낸다(n_media·n_query·n_rank·n_ad_group·n_ad·n_keyword_id·n_keyword·
-- n_campaign_type·n_contract·n_ad_type). 그 값이 이미 우리 랜딩에 도착하고 있는데
-- 받아 적는 쪽이 없어, 네이버 유입 리드를 채널로 식별할 수 없었다(= CPL 산출 불가).
--
-- gclid·fbclid 처럼 컬럼을 하나씩 늘리지 않고 JSONB 한 칸에 담는 이유:
--   1) 파라미터가 10종이고 네이버가 계속 추가한다 — 매번 마이그레이션을 낼 수 없다.
--   2) 이 값들은 개별 축으로 조회되지 않는다. 마케팅 렌즈는 리드를 전량 로드해
--      (lib/repositories/leads.ts fetchAllLeadRows) 메모리에서 접는다.
--   3) "네이버 유입인가"는 컬럼 존재 여부(IS NOT NULL) 하나로 끝난다.
--
-- 그래서 인덱스도 두지 않는다 — 이 컬럼을 WHERE 에 거는 쿼리 자체가 없다.
-- 새 조회 축이 생기면 그때 해당 키에 표현식 인덱스를 추가한다.
--
-- 저장 형태(lib/lead-types.ts LeadPayload.naverAd / lib/repositories/leads.ts):
--   {"n_media":"...","n_ad":"...","n_keyword":"...","n_campaign_type":"...", ...}
-- 값이 하나도 없으면 컬럼은 NULL 로 둔다 — 빈 객체 {} 를 저장하면
-- "네이버 유입인데 파라미터가 비었다"와 "네이버 유입이 아니다"가 구분되지 않는다.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS naver_ad JSONB;

COMMENT ON COLUMN public.leads.naver_ad IS
  '네이버 검색광고 유입 파라미터(n_*) 원본. NULL = 네이버 광고 유입이 아님. 정규화하지 않고 받은 값 그대로 담는다.';
