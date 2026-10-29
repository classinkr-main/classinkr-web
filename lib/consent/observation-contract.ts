/** 서버 전환/분석은 현재 탭이 동의 쿠키 변경을 관찰할 수 있을 때만 허용한다. */
export const CONSENT_OBSERVATION_HEADER = "X-Classin-Consent-Observation"
export const CONSENT_OBSERVATION_VERSION = "cookie-store-v1"

export function hasConsentObservation(headers: Pick<Headers, "get">): boolean {
  return headers.get(CONSENT_OBSERVATION_HEADER) === CONSENT_OBSERVATION_VERSION
}
