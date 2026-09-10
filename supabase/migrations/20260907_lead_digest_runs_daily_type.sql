-- Meta·홈페이지로 두 장 나가던 10:10 KST 아침 카드를 한 장으로 합친다(2026-09-07).
-- 카드가 하나면 창(window)당 실행 레코드도 하나여야 하므로 report_type 에 'daily' 를 허용한다.
--
-- 과거 'meta'/'homepage' 행은 그대로 둔다 — 지난 발송 이력이자, 그때의 부분 실패를
-- 재시도할 때 쓰이던 상태다. 지우면 그 이력이 사라진다.

ALTER TABLE public.lead_digest_runs
  DROP CONSTRAINT IF EXISTS lead_digest_runs_report_type_check;

ALTER TABLE public.lead_digest_runs
  ADD CONSTRAINT lead_digest_runs_report_type_check
  CHECK (report_type IN ('meta', 'homepage', 'daily'));

COMMENT ON TABLE public.lead_digest_runs IS
  '10:10 KST lead digest execution and deduplication state. daily = merged Meta+homepage card (2026-09-07~), meta/homepage = two-card era.';
