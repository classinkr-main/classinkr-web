-- 맞춤형 광고 활용 동의(선택) — 리드별 동의 기록 (2026-11-06)
--   ad_consent          제출 시 동의 값 = 체크 칸 ①(제3자 제공) AND ②(국외 이전). NULL = 그 폼에 체크 칸이 없었음(또는 2026-11-06 이전 리드, 옛 번들 탭). false = 보고 비워 둠/하나만 선택/철회.
--   ad_consent_at       그 값을 받은 시각(제출 timestamp). 재유입 병합 때 최신 제출로 갱신.
--   ad_consent_version  체크 칸 문구 버전(lib/consent/ad-consent.ts AD_CONSENT_VERSION, 예: ad-consent-2026-11-06).
-- 백필 없음. NULL 허용 추가 컬럼만. 재실행 무해.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ad_consent BOOLEAN,
  ADD COLUMN IF NOT EXISTS ad_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ad_consent_version TEXT;

COMMENT ON COLUMN public.leads.ad_consent IS '맞춤형 광고 활용 동의(선택, 제3자 제공 AND 국외 이전). NULL=체크 칸 없는 폼. 해시 연락처 전송은 이 값 true AND 쿠키 마케팅 동의일 때만.';
COMMENT ON COLUMN public.leads.ad_consent_at IS 'ad_consent 를 받은(갱신한) 시각.';
COMMENT ON COLUMN public.leads.ad_consent_version IS '동의 문구 버전 id.';

-- 미적용 창의 fallback:
--   세 컬럼은 OPTIONAL_LEAD_INSERT_COLUMNS 에 들어 있다. stripOptionalLeadColumns 가 ad_consent* 를 한 묶음으로 덜어낸다.
--   isMissingLeadColumn 은 단어 경계로 매칭하도록 바꾼다. 그래서 ga_ad_consent 누락 오류에 ad_consent 묶음이 함께 덜리지 않는다.
--   첫 insert 가 ad_consent 누락으로 실패하면, 1차 재시도가 utm·gclid·ga_* 를 지킨 채 리드를 저장한다. 그 사이 리드는 동의 기록만 잃는다.
--   해시 전송 게이트는 저장과 무관하게 요청 본문의 adConsent 로 판정한다. 그래서 미적용 창에도 동의 없는 해시 전송은 없다.
--   재유입 병합의 updateLeadAdConsent 는 컬럼이 없으면 warn 만 남기고 건너뛴다. 그래도 기록이 비게 되므로, 마이그레이션은 코드 배포 전에 적용한다.
