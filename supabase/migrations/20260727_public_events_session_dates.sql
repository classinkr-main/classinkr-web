-- public_events.session_dates: 띄엄띄엄 열리는 회차 행사(예: 8/3, 8/10, 8/17 세미나) 지원
--
-- NULL이면 기존과 동일한 단일 기간 행사다. 값이 있으면 "YYYY-MM-DD" 문자열 배열이며
-- starts_at / ends_at은 그대로 봉투(첫 회차 시작 ~ 마지막 회차 종료)로 유지된다.
-- 회차 공용 시각은 starts_at / ends_at의 KST 시각부에서 되읽으므로 별도 컬럼을 두지 않는다.
-- 이 덕분에 상태 자동계산·캠페인 귀속·캘린더 범위 쿼리는 변경 없이 계속 동작한다.
ALTER TABLE public.public_events
  ADD COLUMN IF NOT EXISTS session_dates jsonb;

COMMENT ON COLUMN public.public_events.session_dates IS
  'NULL이면 starts_at~ends_at 단일 기간. 값이 있으면 개별 회차 날짜("YYYY-MM-DD") 배열이며 starts_at/ends_at은 그 봉투를 유지한다.';

-- 배열 형태 + 원소 포맷 방어 (빈 배열은 NULL로 정규화해서 저장하므로 금지).
--
-- CHECK 식에는 서브쿼리를 쓸 수 없어 IMMUTABLE 함수로 감싼다.
-- 이건 "모양" 방어까지만 한다 — 2026-02-31처럼 달력에 없는 날짜를 걸러내는 일은
-- 앱의 normalizeSessionDates(lib/public-event-dates.ts)가 맡고, 그쪽에 테스트가 있다.
CREATE OR REPLACE FUNCTION public.public_events_session_dates_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT value IS NULL OR (
    jsonb_typeof(value) = 'array'
    AND jsonb_array_length(value) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS elem
      WHERE jsonb_typeof(elem) <> 'string'
         OR elem #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$'
    )
  );
$$;

ALTER TABLE public.public_events
  DROP CONSTRAINT IF EXISTS public_events_session_dates_shape;

ALTER TABLE public.public_events
  ADD CONSTRAINT public_events_session_dates_shape
  CHECK (public.public_events_session_dates_valid(session_dates));
