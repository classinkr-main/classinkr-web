/**
 * 쿠키 동의(옵트인) + Google Consent Mode v2 공용 유틸 (브라우저 전용).
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
const COOKIE_MAX_AGE = 60 * 60 * 24 * 391

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

function writeCookie(name: string, value: string, maxAge: number) {
  if (!isBrowser()) return
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
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

/** 동의를 저장하고 Consent Mode 갱신 + 이벤트 발행 + 서버 감사로그 기록. */
export function saveConsent(choice: ConsentChoice): ConsentRecord {
  const record: ConsentRecord = {
    v: CONSENT_POLICY_VERSION,
    analytics: choice.analytics,
    marketing: choice.marketing,
    ts: Date.now(),
  }
  writeCookie(CONSENT_COOKIE, JSON.stringify(record), COOKIE_MAX_AGE)
  applyConsentMode(choice)
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
    void logConsent(record)
  }
  return record
}

async function logConsent(record: ConsentRecord) {
  try {
    await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analytics: record.analytics,
        marketing: record.marketing,
        policy_version: record.v,
        anonymous_id: getAnonymousId(),
      }),
      keepalive: true,
    })
  } catch {
    // 감사로그 실패는 UX를 막지 않는다
  }
}

/**
 * 익명 식별자(cln_aid). 트래킹/신원 결합용.
 * 분석 동의가 있을 때만 생성 — 동의 전에는 트래킹 쿠키를 심지 않는다.
 */
export function getAnonymousId(): string | null {
  if (!isBrowser()) return null
  const existing = readCookie(ANONYMOUS_ID_COOKIE)
  if (existing) return existing
  if (!currentChoice().analytics) return null
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  writeCookie(ANONYMOUS_ID_COOKIE, id, COOKIE_MAX_AGE)
  return id
}
