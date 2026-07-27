-- partner_sales_records 중복 입력 이중계상 방지.
--
-- (partner_id, deal_id, sales_month) 가 실적의 자연키인데 유니크 제약이 없고,
-- 코드(lib/partners-data.ts upsertSupabaseSales)도 신규 저장을 plain insert 로 해서
-- 같은 달 실적을 두 번 저장하면 월 합산이 이중계상된다.
-- 이 파일과 같은 커밋에서 코드를 insert → upsert(onConflict) 로 전환한다.
--
-- deal_id 는 NULL(딜 미연결 실적)일 수 있으므로 NULLS NOT DISTINCT 로
-- NULL 끼리도 같은 키로 취급한다(PG15+, 라이브 17.6 확인).

-- 혹시 있을 기존 중복 제거: 가장 최근 갱신본((updated_at, id) 최대)만 남긴다.
-- 라이브 확인(2026-07-27): 테이블 0행 — 실제 삭제 대상 없음, 다른 환경 대비 안전장치.
DELETE FROM public.partner_sales_records a
USING public.partner_sales_records b
WHERE a.partner_id = b.partner_id
  AND a.sales_month = b.sales_month
  AND a.deal_id IS NOT DISTINCT FROM b.deal_id
  AND (b.updated_at, b.id) > (a.updated_at, a.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_sales_records_partner_deal_month
  ON public.partner_sales_records (partner_id, deal_id, sales_month) NULLS NOT DISTINCT;
