/**
 * 쿠키 동의(옵트인) + Google Consent Mode v2 공용 유틸.
 * 기획: docs/active/lead-funnel-consent-auth-scoring-plan-2026-06-14.md (D3, WS1)
 *
 * React 훅은 lib/consent/useConsent.ts 참고.
 */

export type ConsentCategory = "analytics" | "marketing"

export interface ConsentChoice {
  analytics: boolean
  marketing: boolean
}

export interface ConsentRecord extends ConsentChoice {
  /** 동의한 정책 버전 — 정책이 바뀌면 재동의 요청 */
  v: string
  /** 동의 시각(epoch ms) */
  ts: number
}

export const CONSENT_COOKIE = "cln_consent"
export const ANONYMOUS_ID_COOKIE = "cln_aid"

/** 동의 상태가 바뀔 때 발행 — 픽셀/트래킹 컴포넌트가 구독 */
export const CONSENT_CHANGE_EVENT = "cln:consent-change"
/** 푸터 "쿠키 설정" 등에서 배너 재오픈 요청 */
export const OPEN_CONSENT_EVENT = "cln:open-consent"

export const CONSENT_POLICY_VERSION =
  process.env.NEXT_PUBLIC_CONSENT_POLICY_VERSION?.trim() || "2026-06-14"

/** 13개월 (KR PIPA / EU 권고 상한) */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 391

export const DENIED_CHOICE: ConsentChoice = { analytics: false, marketing: false }
export const GRANTED_CHOICE: ConsentChoice = { analytics: true, marketing: true }

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"))
  return match ? decodeURIComponent(match[1]) : null
}

/** 쿠키 원문(raw 문자열)을 읽는다 — useSyncExternalStore 스냅샷용(참조 안정성). */
export function readConsentRaw(): string {
  return readCookie(CONSENT_COOKIE) ?? ""
}

/** raw 문자열을 동의 기록으로 파싱한다. 정책 버전이 다르면 null(재동의 필요). */
export function parseConsent(raw: string | null): ConsentRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>
    if (parsed.v !== CONSENT_POLICY_VERSION) return null
    return {
      v: CONSENT_POLICY_VERSION,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
    }
  } catch {
    return null
  }
}

/** 저장된 동의 기록을 읽는다. 없거나 정책 버전이 다르면 null(재동의 필요). */
export function readConsent(): ConsentRecord | null {
  return parseConsent(readConsentRaw() || null)
}

/** 현재 유효한 동의 선택 (미결정 시 모두 거부). */
export function currentChoice(): ConsentChoice {
  const record = readConsent()
  return record ? { analytics: record.analytics, marketing: record.marketing } : DENIED_CHOICE
}

export function hasDecision(): boolean {
  return readConsent() !== null
}

/** Google Consent Mode v2 update 신호 전송 (gtag는 layout 부트스트랩에서 정의됨). */
export function applyConsentMode(choice: ConsentChoice) {
  if (!isBrowser()) return
  const w = window as unknown as { gtag?: (...args: unknown[]) => void }
  if (typeof w.gtag !== "function") return
  w.gtag("consent", "update", {
    ad_storage: choice.marketing ? "granted" : "denied",
    ad_user_data: choice.marketing ? "granted" : "denied",
    ad_personalization: choice.marketing ? "granted" : "denied",
    analytics_storage: choice.analytics ? "granted" : "denied",
  })
}

interface ConsentSaveResponse {
  ok?: boolean
  record?: ConsentRecord
}

/** 동의를 서버에 저장하고, 서버 Set-Cookie 반영 후 Consent Mode + 이벤트를 갱신한다. */
export async function saveConsent(choice: ConsentChoice): Promise<ConsentRecord> {
  const response = await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      analytics: choice.analytics,
      marketing: choice.marketing,
      policy_version: CONSENT_POLICY_VERSION,
      anonymous_id: readAnonymousId(),
    }),
  })

  const data = (await response.json().catch(() => null)) as ConsentSaveResponse | null
  if (!response.ok || data?.ok !== true || !data.record) {
    throw new Error("Failed to save cookie consent.")
  }

  const record = data.record
  applyConsentMode(record)
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
  }
  return record
}

export function readAnonymousId(): string | null {
  return readCookie(ANONYMOUS_ID_COOKIE)
}

/**
 * 익명 식별자(cln_aid). 트래킹/신원 결합용.
 * 서버가 분석 동의 저장 시 발급한다. 클라이언트에서는 읽기만 한다.
 */
export function getAnonymousId(): string | null {
  if (!currentChoice().analytics) return null
  return readAnonymousId()
}
