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
  /** 동일 브라우저의 동의 선택을 식별한다. 응답의 신선도 확인에만 사용한다. */
  rid?: string
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
  const cookies = document.cookie
  if (typeof cookies !== "string") return null
  const match = cookies.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"))
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
      // 문자열 "false" 등 잘못된 쿠키를 허용으로 해석하지 않는다.
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
      s: parsed.s === 0 ? 0 : 1,
      ...(typeof parsed.rid === "string" ? { rid: parsed.rid } : {}),
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
  // 서버의 정책 검증과 감사 저장이 완료되기 전에는 옵트인 태그를 켜지 않는다.
  return record && record.s !== 0 ? { analytics: record.analytics, marketing: record.marketing } : DENIED_CHOICE
}

export function hasDecision(): boolean {
  return readConsent() !== null
}

/** Google Consent Mode v2 update 신호 전송 (gtag는 layout 부트스트랩에서 정의됨). */
export function applyConsentMode(choice: ConsentChoice) {
  if (!isBrowser()) return
  const w = window as unknown as { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void }
  w.fbq?.("consent", choice.marketing ? "grant" : "revoke")
  w.gtag?.("consent", "update", {
    ad_storage: choice.marketing ? "granted" : "denied",
    ad_user_data: choice.marketing ? "granted" : "denied",
    ad_personalization: choice.marketing ? "granted" : "denied",
    analytics_storage: choice.analytics ? "granted" : "denied",
  })
}

interface ConsentSaveResponse {
  ok?: boolean
  record?: ConsentRecord
  stored?: boolean
  anonymous_id?: string | null
}

/** 다른 탭에 최신 결정을 알리고, 구형 응답이 쿠키를 덮었을 때 복원할 로컬 정본. */
export const CONSENT_SIGNAL_KEY = "classin.consent.latest.v1"
const CONSENT_STATE_LOCK = "classin-consent-state-v1"
const CONSENT_NETWORK_LOCK = "classin-consent-network-v1"
const CONSENT_REQUEST_TIMEOUT_MS = 8_000

function lockManager(): LockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null
}

function canCoordinateTabs(): boolean {
  if (!isBrowser() || !lockManager() || !globalThis.crypto?.randomUUID) return false
  try {
    const key = `${CONSENT_SIGNAL_KEY}.probe`
    window.localStorage.setItem(key, "1")
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function writeAnonymousId(id: string | null) {
  if (!isBrowser()) return
  const secure = window.location.protocol === "https:" ? "; secure" : ""
  const validId = id && /^[A-Za-z0-9._:-]{8,100}$/.test(id) ? id : ""
  document.cookie = `${ANONYMOUS_ID_COOKIE}=${encodeURIComponent(validId)}; path=/; max-age=${validId ? CONSENT_COOKIE_MAX_AGE : 0}; samesite=lax${secure}`
}

function readLatestDecision(): ConsentRecord | null {
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_SIGNAL_KEY))
  } catch {
    return null
  }
}

/** 잠금 안에서 쿠키와 탭 공유 정본을 함께 갱신한다. */
function publishDecision(record: ConsentRecord) {
  window.localStorage.setItem(CONSENT_SIGNAL_KEY, JSON.stringify(record))
  writeConsentCookie(record)
  if (!record.analytics) writeAnonymousId(null)
  notifyConsentChange(record)
}

function notifyConsentChange(record: ConsentRecord) {
  applyConsentMode(record.s === 0 ? DENIED_CHOICE : record)
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
  }
}

/**
 * 네트워크 대기 중에도 철회는 즉시 로컬에 반영된다. 신규 프로토콜은 서버가
 * Set-Cookie를 보내지 않으므로 늦게 도착한 응답이 브라우저 쿠키를 덮지 못한다.
 */
async function syncConsentToServer(record: ConsentRecord): Promise<ConsentSaveResponse | null> {
  const manager = lockManager()
  if (!manager) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONSENT_REQUEST_TIMEOUT_MS)
  try {
    return await manager.request(CONSENT_NETWORK_LOCK, { signal: controller.signal }, async () => {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Consent-Client-Commit": "1" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({
          analytics: record.analytics,
          marketing: record.marketing,
          policy_version: record.v,
          anonymous_id: readAnonymousId(),
        }),
      })
      const data = (await response.json().catch(() => null)) as ConsentSaveResponse | null
      if (!response.ok || response.headers.get("x-consent-client-commit") !== "1" || data?.ok !== true || !data.record) return null
      if (data.record.v !== CONSENT_POLICY_VERSION || data.record.analytics !== record.analytics || data.record.marketing !== record.marketing) return null
      return data
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function commitSyncResult(record: ConsentRecord, result: ConsentSaveResponse | null): Promise<ConsentRecord> {
  const manager = lockManager()
  if (!manager) return readConsent() ?? record
  return manager.request(CONSENT_STATE_LOCK, () => {
    const latest = readLatestDecision()
    if (!latest) {
      // 저장소가 지워졌으면 예전 응답을 신뢰할 근거가 없다.
      const denied: ConsentRecord = { v: CONSENT_POLICY_VERSION, ...DENIED_CHOICE, ts: Date.now(), s: 0, rid: globalThis.crypto.randomUUID() }
      try { publishDecision(denied) } catch {
        writeConsentCookie(denied)
        writeAnonymousId(null)
        notifyConsentChange(denied)
      }
      return denied
    }
    if (latest.rid !== record.rid) {
      // 구형 서버/탭의 늦은 Set-Cookie가 도착한 경우에도 탭 공유 정본을 복원한다.
      publishDecision(latest)
      return latest
    }
    const committed = { ...latest, s: result?.stored ? 1 as const : 0 as const }
    publishDecision(committed)
    if (committed.analytics && result?.anonymous_id) writeAnonymousId(result.anonymous_id)
    return committed
  })
}

/**
 * 동의를 저장한다. **로컬 우선(optimistic) 저장** 후 서버와 동기화한다.
 *
 * 서버 왕복이 실패해도(오프라인·429·5xx·배포 중) 사용자의 선택은 쿠키에 이미
 * 남으므로 배너가 다시 뜨지 않는다. 동기화 실패는 `s:0`으로 표시해 다음 방문에
 * `resyncPendingConsent()`가 감사 로그를 재시도한다.
 */
export async function saveConsent(choice: ConsentChoice): Promise<ConsentRecord> {
  if (!canCoordinateTabs()) {
    // 탭 간 순서를 보장할 수 없을 때는 선택 쿠키를 허용하지 않는다.
    const denied: ConsentRecord = { v: CONSENT_POLICY_VERSION, ...DENIED_CHOICE, ts: Date.now(), s: 0 }
    writeConsentCookie(denied)
    writeAnonymousId(null)
    notifyConsentChange(denied)
    if (choice.analytics || choice.marketing) throw new Error("이 브라우저에서는 동의 설정을 안전하게 저장할 수 없습니다.")
    return denied
  }
  const manager = lockManager()!
  const record = await manager.request(CONSENT_STATE_LOCK, () => {
    const next: ConsentRecord = {
      v: CONSENT_POLICY_VERSION,
      analytics: choice.analytics,
      marketing: choice.marketing,
      ts: Date.now(),
      s: 0,
      rid: globalThis.crypto.randomUUID(),
    }
    publishDecision(next)
    return next
  })
  const result = await syncConsentToServer(record)
  return commitSyncResult(record, result)
}

/**
 * 이전 방문에서 서버 동기화에 실패한 동의(`s:0`)를 조용히 재시도한다.
 * 감사 로그(PIPA/GDPR 입증 책임) 누락을 메우기 위한 best-effort 경로.
 */
export async function resyncPendingConsent(): Promise<void> {
  if (!canCoordinateTabs()) return
  const manager = lockManager()!
  const record = await manager.request(CONSENT_STATE_LOCK, () => {
    const current = readConsent()
    if (!current || current.s !== 0) return null
    const next = current.rid ? current : { ...current, rid: globalThis.crypto.randomUUID() }
    publishDecision(next)
    return next
  })
  if (!record) return
  const result = await syncConsentToServer(record)
  await commitSyncResult(record, result)
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
