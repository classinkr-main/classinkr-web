import { supportsConsentCoordination } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

/** 실제 구독을 설치했고 지금도 같은 cookieStore를 관찰하는 탭만 신호를 보낸다. */
export function consentObservationHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const context = window as unknown as {
      __classinConsentObserverReady?: boolean
      __classinConsentObservedStore?: unknown
      cookieStore?: unknown
    }
    if (!supportsConsentCoordination() || context.__classinConsentObserverReady !== true || !context.cookieStore || context.__classinConsentObservedStore !== context.cookieStore) return {}
    return { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION }
  } catch {
    return {}
  }
}
