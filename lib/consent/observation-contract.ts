/**
 * 정직한 클라이언트가 현재 탭의 동의 변경 관찰 기능을 알리는 신호다.
 * 헤더는 임의로 위조할 수 있으므로 인증 또는 관찰 증명으로 취급하지 않는다.
 */
export const CONSENT_OBSERVATION_HEADER = "X-Classin-Consent-Observation"
export const CONSENT_OBSERVATION_VERSION = "cookie-store-v1"

export function hasConsentObservation(headers: Pick<Headers, "get">): boolean {
  return headers.get(CONSENT_OBSERVATION_HEADER) === CONSENT_OBSERVATION_VERSION
}
