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
  /** 허용을 선택할 때 이미 본 카테고리별 철회 표식. 나중 철회는 이 허용보다 우선한다. */
  ackAnalytics?: string
  ackMarketing?: string
}

export const CONSENT_COOKIE = "cln_consent"
export const ANONYMOUS_ID_COOKIE = "cln_aid"
export const ANALYTICS_REVOCATION_COOKIE = "cln_revoke_a"
export const MARKETING_REVOCATION_COOKIE = "cln_revoke_m"
const NONCE_UNAVAILABLE = "uncoordinated"

export interface ConsentRevocations {
  analytics: string | null
  marketing: string | null
}

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
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return NONCE_UNAVAILABLE }
}

/** 쿠키 원문(raw 문자열)을 읽는다 — useSyncExternalStore 스냅샷용(참조 안정성). */
export function readConsentRaw(): string {
  return readCookie(CONSENT_COOKIE) ?? ""
}

export function readConsentRevocations(): ConsentRevocations {
  return { analytics: readCookie(ANALYTICS_REVOCATION_COOKIE), marketing: readCookie(MARKETING_REVOCATION_COOKIE) }
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
      // 기존 쿠키의 생략은 호환하되, 정의된 값은 숫자 1만 확인 완료로 취급한다.
      s: parsed.s === undefined || parsed.s === 1 ? 1 : 0,
      ...(typeof parsed.rid === "string" ? { rid: parsed.rid } : {}),
      ...(typeof parsed.ackAnalytics === "string" ? { ackAnalytics: parsed.ackAnalytics } : {}),
      ...(typeof parsed.ackMarketing === "string" ? { ackMarketing: parsed.ackMarketing } : {}),
    }
  } catch {
    return null
  }
}

/**
 * 동의 쿠키를 클라이언트에서 즉시 기록한다.
 *
 * 클라이언트가 최신 결정만 기록하며 서버 확인 전에는 s:0으로 거부한다.
 * 브라우저의 쿠키 수명 제한이나 저장 실패로 재선택이 필요할 수 있다.
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

/** 정책·감사 확인 전의 선택은 브라우저와 서버 모두 거부로 취급한다. */
export function effectiveConsentChoice(record: ConsentRecord | null, revocations: ConsentRevocations): ConsentChoice {
  // 서버의 정책 검증과 감사 저장이 완료되기 전에는 옵트인 태그를 켜지 않는다.
  if (!record || record.s === 0) return DENIED_CHOICE
  return {
    analytics: record.analytics && !!revocations.analytics && revocations.analytics !== NONCE_UNAVAILABLE && record.ackAnalytics === revocations.analytics,
    marketing: record.marketing && !!revocations.marketing && revocations.marketing !== NONCE_UNAVAILABLE && record.ackMarketing === revocations.marketing,
  }
}

/** 현재 유효한 동의 선택 (미결정 시 모두 거부). */
export function currentChoice(): ConsentChoice {
  // 다른 탭과 안전하게 조정할 수 없으면 기존 쿠키도 옵트인으로 복원하지 않는다.
  if (!supportsConsentCoordination()) return DENIED_CHOICE
  return effectiveConsentChoice(readConsent(), readConsentRevocations())
}

export function hasDecision(): boolean {
  return hasValidDecision(readConsent(), readConsentRevocations())
}

/** 표식이 없는 옛 허용 쿠키는 안전하게 확인할 수 없으므로 재선택을 요청한다. */
export function hasValidDecision(record: ConsentRecord | null, revocations: ConsentRevocations): boolean {
  if (!record) return false
  const analyticsValid = !record.analytics || (!!revocations.analytics && revocations.analytics !== NONCE_UNAVAILABLE && record.ackAnalytics === revocations.analytics)
  const marketingValid = !record.marketing || (!!revocations.marketing && revocations.marketing !== NONCE_UNAVAILABLE && record.ackMarketing === revocations.marketing)
  return analyticsValid && marketingValid
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
export const CONSENT_PULSE_KEY = "classin.consent.changed.v1"
const CONSENT_STATE_LOCK = "classin-consent-state-v1"
const CONSENT_NETWORK_LOCK = "classin-consent-network-v1"
const CONSENT_REQUEST_TIMEOUT_MS = 8_000

function lockManager(): LockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null
}

/** 현재 탭이 다른 탭의 쿠키 철회를 관찰할 수 있는가. */
export function supportsCookieObservation(): boolean {
  if (!isBrowser()) return false
  try {
    const browser = window as unknown as { cookieStore?: { addEventListener?: unknown; removeEventListener?: unknown }; __classinConsentObserverReady?: boolean; __classinConsentObservedStore?: unknown }
    const store = browser.cookieStore
    return browser.__classinConsentObserverReady === true && browser.__classinConsentObservedStore === store && typeof store?.addEventListener === "function" && typeof store?.removeEventListener === "function"
  } catch {
    return false
  }
}

export function supportsConsentCoordination(): boolean {
  if (!isBrowser() || !supportsCookieObservation() || !lockManager() || !globalThis.crypto?.randomUUID) return false
  try {
    const key = `${CONSENT_SIGNAL_KEY}.probe`
    window.localStorage.setItem(key, "1")
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** 거절 표식은 Web Locks·localStorage와 독립되어 늦은 허용 응답보다 우선한다. */
function writeRevocation(name: string): string {
  let nonce = NONCE_UNAVAILABLE
  if (globalThis.crypto?.randomUUID) nonce = globalThis.crypto.randomUUID()
  else if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    nonce = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  }
  const secure = window.location.protocol === "https:" ? "; secure" : ""
  document.cookie = `${name}=${encodeURIComponent(nonce)}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; samesite=lax${secure}`
  if (readCookie(name) !== nonce) throw new Error("쿠키 설정을 안전하게 저장할 수 없습니다.")
  return nonce
}

/** 배너가 열리기 전에 빈 표식을 준비한다. 이 함수는 허용 기록이나 네트워크 요청을 만들지 않는다. */
export function prepareConsentMarkers(): void {
  if (!supportsConsentCoordination()) return
  try {
    const current = readConsentRevocations()
    if (!current.analytics || current.analytics === NONCE_UNAVAILABLE) writeRevocation(ANALYTICS_REVOCATION_COOKIE)
    if (!current.marketing || current.marketing === NONCE_UNAVAILABLE) writeRevocation(MARKETING_REVOCATION_COOKIE)
  } catch {
    applyConsentMode(DENIED_CHOICE)
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
  writeConsentCookie(record)
  if (!record.analytics) writeAnonymousId(null)
  try {
    // 다른 탭이 storage 이벤트를 받았을 때 반드시 새 쿠키를 읽어야 한다.
    window.localStorage.setItem(CONSENT_SIGNAL_KEY, JSON.stringify(record))
  } catch (error) {
    // 저장소가 중간에 차단되면 탭 간 순서를 확인할 수 없으므로 허용을 남기지 않는다.
    const denied: ConsentRecord = { ...record, ...DENIED_CHOICE, s: 0 }
    try {
      writeRevocation(ANALYTICS_REVOCATION_COOKIE)
      writeRevocation(MARKETING_REVOCATION_COOKIE)
    } catch {
      // 이 탭의 Consent Mode는 아래에서 거절한다. 쿠키 쓰기 자체가 불가하면 다른 탭 보장은 불가능하다.
    }
    writeConsentCookie(denied)
    writeAnonymousId(null)
    notifyConsentChange(denied)
    throw error
  }
  notifyConsentChange(record)
}

function notifyConsentChange(record: ConsentRecord) {
  applyConsentMode(supportsConsentCoordination() ? effectiveConsentChoice(record, readConsentRevocations()) : DENIED_CHOICE)
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
    // 결정 정본을 덮지 않는 알림 전용 키 — 상태 잠금을 기다리는 중에도 다른 탭에 철회를 알린다.
    try { window.localStorage.setItem(CONSENT_PULSE_KEY, globalThis.crypto?.randomUUID?.() ?? String(Date.now())) } catch { /* BroadcastChannel도 시도한다. */ }
    // 저장소 접근이 실행 중 차단되더라도 다른 탭이 철회를 인지할 수 있게 보조 신호를 보낸다.
    try {
      if (typeof window.BroadcastChannel === "function") {
        const channel = new window.BroadcastChannel(CONSENT_SIGNAL_KEY)
        channel.postMessage("changed")
        channel.close()
      }
    } catch {
      // storage/cookieStore/focus 구독이 남아 있다.
    }
  }
}

function denyWithoutCoordination(): ConsentRecord {
  applyConsentMode(DENIED_CHOICE)
  writeRevocation(ANALYTICS_REVOCATION_COOKIE)
  writeRevocation(MARKETING_REVOCATION_COOKIE)
  const denied: ConsentRecord = { v: CONSENT_POLICY_VERSION, ...DENIED_CHOICE, ts: Date.now(), s: 0 }
  writeConsentCookie(denied)
  writeAnonymousId(null)
  notifyConsentChange(denied)
  return denied
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
    const revocations = readConsentRevocations()
    const unseenRevocation =
      (latest.analytics && !!latest.ackAnalytics && !!revocations.analytics && latest.ackAnalytics !== revocations.analytics) ||
      (latest.marketing && !!latest.ackMarketing && !!revocations.marketing && latest.ackMarketing !== revocations.marketing)
    if (unseenRevocation) {
      // 다른 탭의 무조정 거절을 오래된 허용 응답이 덮었다. 유효 선택을 거절 정본으로 만들고
      // 옛 허용의 서버 응답을 받은 뒤 감사 저장을 재시도한다.
      const effective = effectiveConsentChoice({ ...latest, s: 1 }, revocations)
      const corrected: ConsentRecord = {
        ...latest,
        ...effective,
        s: 0,
        rid: globalThis.crypto.randomUUID(),
        ...(revocations.analytics ? { ackAnalytics: revocations.analytics } : {}),
        ...(revocations.marketing ? { ackMarketing: revocations.marketing } : {}),
      }
      publishDecision(corrected)
      queueMicrotask(() => { void resyncPendingConsent().catch(() => undefined) })
      return corrected
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
  if (!supportsConsentCoordination()) {
    // 탭 간 순서를 보장할 수 없을 때는 선택 쿠키를 허용하지 않는다.
    const denied = denyWithoutCoordination()
    if (choice.analytics || choice.marketing) throw new Error("이 브라우저에서는 동의 설정을 안전하게 저장할 수 없습니다.")
    return denied
  }
  // 호출 시점의 철회 표식을 먼저 관측한다. 잠금 대기 중 새 철회가 생기면 오래된 허용이 그 표식을 확인할 수 없다.
  const revocations = readConsentRevocations()
  const needsPreparation =
    (choice.analytics && (!revocations.analytics || revocations.analytics === NONCE_UNAVAILABLE)) ||
    (choice.marketing && (!revocations.marketing || revocations.marketing === NONCE_UNAVAILABLE))
  if (needsPreparation) {
    // 표식 확인과 초기화 사이의 다른 탭 거절을 허용이 덮지 않도록 이 요청 자체는 허용하지 않는다.
    prepareConsentMarkers()
    const denied: ConsentRecord = { v: CONSENT_POLICY_VERSION, ...DENIED_CHOICE, ts: Date.now(), s: 0 }
    writeConsentCookie(denied)
    writeAnonymousId(null)
    notifyConsentChange(denied)
    throw new Error("동의 설정을 준비했습니다. 다시 선택해 주세요.")
  }
  try {
    if (!choice.analytics) {
      revocations.analytics = writeRevocation(ANALYTICS_REVOCATION_COOKIE)
    }
    if (!choice.marketing) {
      revocations.marketing = writeRevocation(MARKETING_REVOCATION_COOKIE)
    }
  } catch (error) {
    notifyConsentChange({ v: CONSENT_POLICY_VERSION, ...DENIED_CHOICE, ts: Date.now(), s: 0 })
    throw error
  }
  if (!choice.analytics || !choice.marketing) {
    // 상태 잠금이 오래 걸려도 현재 탭과 다른 탭의 허용 모드는 즉시 철회한다.
    notifyConsentChange(readConsent() ?? { v: CONSENT_POLICY_VERSION, ...DENIED_CHOICE, ts: Date.now(), s: 0 })
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
      ...(revocations.analytics ? { ackAnalytics: revocations.analytics } : {}),
      ...(revocations.marketing ? { ackMarketing: revocations.marketing } : {}),
    }
    publishDecision(next)
    return next
  })
  const result = await syncConsentToServer(record)
  if (!supportsConsentCoordination()) {
    const denied = denyWithoutCoordination()
    if (choice.analytics || choice.marketing) throw new Error("이 브라우저에서는 동의 설정을 안전하게 저장할 수 없습니다.")
    return denied
  }
  return commitSyncResult(record, result)
}

/**
 * 이전 방문에서 서버 동기화에 실패한 동의(`s:0`)를 조용히 재시도한다.
 * 감사 로그(PIPA/GDPR 입증 책임) 누락을 메우기 위한 best-effort 경로.
 */
export async function resyncPendingConsent(): Promise<void> {
  if (!supportsConsentCoordination()) return
  const manager = lockManager()!
  const record = await manager.request(CONSENT_STATE_LOCK, () => {
    const current = readConsent()
    if (!current) return null
    const revocations = readConsentRevocations()
    const unseenRevocation =
      (current.analytics && !!current.ackAnalytics && !!revocations.analytics && current.ackAnalytics !== revocations.analytics) ||
      (current.marketing && !!current.ackMarketing && !!revocations.marketing && current.ackMarketing !== revocations.marketing)
    if (current.s !== 0 && !unseenRevocation) return null
    // 표식이 없거나 확인하지 않은 예전 허용은 서버에 다시 허용으로 기록하지 않는다.
    if (!unseenRevocation && !hasValidDecision(current, revocations)) return null
    const next = unseenRevocation
      ? { ...current, ...effectiveConsentChoice({ ...current, s: 1 }, revocations), s: 0 as const, rid: globalThis.crypto.randomUUID() }
      : current.rid ? current : { ...current, rid: globalThis.crypto.randomUUID() }
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
