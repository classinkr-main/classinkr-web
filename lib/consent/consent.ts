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
  /** 서버 감사 로그(consent_logs) 반영 여부. 0이면 다음 방문에 재동기화 시도. */
  s?: 0 | 1
}

export const CONSENT_COOKIE = "cln_consent"
export const ANONYMOUS_ID_COOKIE = "cln_aid"

/** 동의 상태가 바뀔 때 발행 — 픽셀/트래킹 컴포넌트가 구독 */
export const CONSENT_CHANGE_EVENT = "cln:consent-change"
/** 푸터 "쿠키 설정" 등에서 배너 재오픈 요청 */
export const OPEN_CONSENT_EVENT = "cln:open-consent"

/**
 * 동의 정책 버전. **반드시 소스 상수로 유지한다.**
 *
 * 과거에는 `NEXT_PUBLIC_CONSENT_POLICY_VERSION` env를 읽었으나, 이 값은
 * 클라이언트 번들에는 **빌드 시점에 인라인**되고 서버 라우트에서는 **런타임에**
 * 평가된다. 두 값이 어긋나면 `POST /api/consent`가 400을 반환해 동의 쿠키가
 * 영영 저장되지 않고 배너가 매 페이지마다 다시 뜬다(무한 재노출).
 * 정책이 바뀌면 이 상수를 올려 배포한다 — 클라이언트/서버가 항상 함께 갱신된다.
 */
export const CONSENT_POLICY_VERSION = "2026-06-14"

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
      s: parsed.s === 0 ? 0 : 1,
    }
  } catch {
    return null
  }
}

/**
 * 동의 쿠키를 클라이언트에서 즉시 기록한다.
 *
 * 서버 `Set-Cookie`가 정본이지만(Safari ITP는 document.cookie로 쓴 쿠키의 수명을
 * 7일로 깎는다), 네트워크 실패·429·배포 중 오류로 왕복이 깨져도 **사용자의 선택은
 * 절대 유실되면 안 된다**. 따라서 낙관적으로 먼저 쓰고, 서버 응답이 오면 그 값이
 * 덮어써서 만료를 정상 수명으로 되돌린다.
 */
export function writeConsentCookie(record: ConsentRecord): void {
  if (!isBrowser()) return
  const secure = window.location.protocol === "https:" ? "; secure" : ""
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(record))}` +
    `; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; samesite=lax${secure}`
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

function notifyConsentChange(record: ConsentRecord) {
  applyConsentMode(record)
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
  }
}

/**
 * 서버에 동의를 기록한다(감사 로그 + 정본 Set-Cookie).
 * 성공 시 서버가 확정한 기록을, 실패 시 null을 반환한다.
 */
async function syncConsentToServer(record: ConsentRecord): Promise<ConsentRecord | null> {
  try {
    const response = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        analytics: record.analytics,
        marketing: record.marketing,
        policy_version: record.v,
        anonymous_id: readAnonymousId(),
      }),
    })
    const data = (await response.json().catch(() => null)) as ConsentSaveResponse | null
    if (!response.ok || data?.ok !== true || !data.record) return null
    return data.record
  } catch {
    return null
  }
}

/**
 * 동의를 저장한다. **로컬 우선(optimistic) 저장** 후 서버와 동기화한다.
 *
 * 서버 왕복이 실패해도(오프라인·429·5xx·배포 중) 사용자의 선택은 쿠키에 이미
 * 남으므로 배너가 다시 뜨지 않는다. 동기화 실패는 `s:0`으로 표시해 다음 방문에
 * `resyncPendingConsent()`가 감사 로그를 재시도한다.
 */
export async function saveConsent(choice: ConsentChoice): Promise<ConsentRecord> {
  const record: ConsentRecord = {
    v: CONSENT_POLICY_VERSION,
    analytics: choice.analytics,
    marketing: choice.marketing,
    ts: Date.now(),
    s: 0,
  }

  // 1) 먼저 로컬에 확정 — 이후 무슨 일이 나도 선택은 보존된다.
  writeConsentCookie(record)
  notifyConsentChange(record)

  // 2) 서버 동기화(감사 로그 + 정본 쿠키). 실패해도 throw 하지 않는다.
  const serverRecord = await syncConsentToServer(record)
  if (!serverRecord) {
    console.warn("[consent] 서버 동기화 실패 — 선택은 로컬에 보존되었고 다음 방문에 재시도합니다.")
    return record
  }
  // 서버 Set-Cookie가 정본(수명 391일)을 이미 덮어썼다. 반환값만 맞춘다.
  return serverRecord
}

/**
 * 이전 방문에서 서버 동기화에 실패한 동의(`s:0`)를 조용히 재시도한다.
 * 감사 로그(PIPA/GDPR 입증 책임) 누락을 메우기 위한 best-effort 경로.
 */
export async function resyncPendingConsent(): Promise<void> {
  const record = readConsent()
  if (!record || record.s !== 0) return
  await syncConsentToServer(record)
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
