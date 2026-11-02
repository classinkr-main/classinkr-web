-- ─────────────────────────────────────────────────────────────
-- GA4 리드 품질 신호 — leads.ga_* (2026-11-02)
--
-- Google Ads 가 "폼 제출 수"가 아니라 "좋은 리드"에 맞춰 입찰하도록, 영업 단계가 바뀌면 서버가
-- GA4 Measurement Protocol 로 qualify_lead·close_convert_lead 를 보낸다
-- (lib/marketing/lead-quality-signal.ts). MP 이벤트가 광고 클릭에 이어지려면 제출한 브라우저의
-- GA client_id 가 필요한데, 그 값은 제출 요청의 _ga 쿠키에만 있고 지금까지 어디에도 남지 않았다.
-- 그래서 제출 시점에 남긴다.
--
--   ga_client_id        _ga 쿠키의 client_id(<난수>.<초>). 쿠키 동의의 분석 항목이 켜진 제출만 채운다.
--   ga_session_id       _ga_<측정 ID> 쿠키의 세션 ID. 없을 수 있다.
--   ga_ad_consent       같은 제출의 쿠키 동의 마케팅 항목 → MP consent.ad_user_data·ad_personalization.
--                       consent_logs 는 익명 ID 로 이을 수는 있지만 저장 실패가 동의 쿠키를 막지 않는
--                       best-effort 감사 기록이라, 제출 시점 값을 여기 함께 둔다.
--   ga_qualify_sent_at  qualify_lead 를 보낸 시각. 조건부 UPDATE(IS NULL)로 선점해 리드당 한 번만 보낸다.
--   ga_close_sent_at    close_convert_lead 를 보낸 시각. 같은 규칙.
--
-- 전부 NULL 허용 추가 컬럼이고 기존 행은 건드리지 않는다(백필 없음 — 과거 제출의 client_id 는 복구할 수 없다).
-- 리드 저장은 앞의 세 컬럼을 선택 컬럼으로 다뤄(OPTIONAL_LEAD_INSERT_COLUMNS) 미적용 배포 창에서도 죽지 않지만,
-- 그 사이 들어온 리드는 품질 신호를 영영 못 보낸다 — 코드 배포 전에 적용한다. 재실행 무해(IF NOT EXISTS).
-- 이 컬럼들을 WHERE 에 거는 조회는 id(PK) 기준 선점뿐이라 인덱스를 두지 않는다.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ga_client_id TEXT,
  ADD COLUMN IF NOT EXISTS ga_session_id TEXT,
  ADD COLUMN IF NOT EXISTS ga_ad_consent BOOLEAN,
  ADD COLUMN IF NOT EXISTS ga_qualify_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ga_close_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.ga_client_id IS
  '제출 시 _ga 쿠키의 GA4 client_id. 쿠키 동의 분석 항목이 켜진 제출만. 리드 품질 신호(MP)의 결합 키.';
COMMENT ON COLUMN public.leads.ga_session_id IS
  '제출 시 _ga_<측정 ID> 쿠키의 GA4 세션 ID(GS1·GS2 형식에서 추출). 없을 수 있다.';
COMMENT ON COLUMN public.leads.ga_ad_consent IS
  '제출 시 쿠키 동의 마케팅 항목. MP consent.ad_user_data·ad_personalization 에 쓴다. ga_client_id 와 함께만 채운다.';
COMMENT ON COLUMN public.leads.ga_qualify_sent_at IS
  'GA4 qualify_lead 를 보낸(선점한) 시각. NULL 일 때만 조건부 UPDATE 로 선점해 리드당 한 번만 보낸다.';
COMMENT ON COLUMN public.leads.ga_close_sent_at IS
  'GA4 close_convert_lead 를 보낸(선점한) 시각. NULL 일 때만 조건부 UPDATE 로 선점해 리드당 한 번만 보낸다.';
