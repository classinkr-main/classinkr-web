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

/**
 * 동의한 쿠키 정책 버전. 개인정보처리방침의 쿠키 항목(app/privacy/page.tsx #cookies)과 함께 올린다 —
 * 값이 바뀌면 모든 방문자에게 배너가 다시 뜬다. env 로 덮지 않는다(운영 env 가 옛 값을 고정하면
 * 재동의가 무음으로 빠진다).
 */
export const CONSENT_POLICY_VERSION = "2026-11-06"

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
  const w = window as unknown as { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void }
  w.fbq?.("consent", choice.marketing ? "grant" : "revoke")
  w.gtag?.("consent", "update", {
    ad_storage: choice.marketing ? "granted" : "denied",
    ad_user_data: choice.marketing ? "granted" : "denied",
    ad_personalization: choice.marketing ? "granted" : "denied",
    analytics_storage: choice.analytics ? "granted" : "denied",
  })
}

/* ── 철회 뒤 정리(쿠키 점검 C12) ─────────────────────────────────────────────
 * 끈 범주의 외부 쿠키를 우리 도메인에서 만료하고, 이미 불러온 추적 스크립트는 새로고침으로 내린다.
 * Consent Mode denied·fbq revoke 만으로는 이미 config 된 GA4 가 쿠키 없는 핑을 보내고, GTM 컨테이너의
 * 자체 트리거와 네이버·카카오 스크립트(철회 신호가 없다)가 새로고침 전까지 남는다.
 */

/** '분석'을 끄면 만료한다 — Google 애널리틱스(_ga, _ga_<측정 ID>, 옛 _gat). */
function isAnalyticsTrackingCookie(name: string): boolean {
  return name.startsWith("_ga") && !name.startsWith("_gac_")
}

/** '마케팅'을 끄면 만료한다 — Google Ads 클릭·전환(_gcl_*, _gac_*)과 Meta 픽셀(_fbp, _fbc). */
function isMarketingTrackingCookie(name: string): boolean {
  return name.startsWith("_gcl_") || name.startsWith("_gac_") || name === "_fbp" || name === "_fbc"
}

/** document.cookie 문자열에서 지금 선택으로 끈 범주의 외부 추적 쿠키 이름만 고른다. */
export function trackingCookiesToExpire(cookieString: string, choice: ConsentChoice): string[] {
  const names = new Set<string>()
  for (const part of cookieString.split(";")) {
    const name = part.split("=")[0]?.trim()
    if (!name) continue
    if ((!choice.analytics && isAnalyticsTrackingCookie(name)) || (!choice.marketing && isMarketingTrackingCookie(name))) {
      names.add(name)
    }
  }
  return [...names]
}

/**
 * 쿠키를 지울 도메인 후보. gtag·Meta 는 cookie_domain 'auto' 라 최상위 등록 도메인(.classin.kr 등)에
 * 쓰고, 다른 도구는 호스트에만 쓰기도 한다. 어느 쪽인지 알 수 없어 호스트 전용(null)과 상위 도메인을 모두
 * 적는다. 공용 접미사(co.kr)처럼 쓸 수 없는 도메인은 브라우저가 조용히 무시한다.
 */
export function cookieDomainCandidates(hostname: string): Array<string | null> {
  const host = hostname.trim().toLowerCase()
  if (!host || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return [null]
  const labels = host.split(".")
  const domains: Array<string | null> = [null]
  for (let i = 0; i <= labels.length - 2; i++) domains.push(labels.slice(i).join("."))
  return domains
}

/**
 * 끈 범주의 _ga*·_gcl_*·_fbp·_fbc 를 우리 도메인에서 만료한다. 이미 받은 곳이 가진 정보는 지우지 못한다.
 * @returns 만료한 쿠키 이름
 */
export function expireTrackingCookies(choice: ConsentChoice): string[] {
  if (!isBrowser()) return []
  let names: string[] = []
  try {
    names = trackingCookiesToExpire(document.cookie ?? "", choice)
    if (names.length === 0) return []
    const secure = window.location?.protocol === "https:" ? "; Secure" : ""
    const domains = cookieDomainCandidates(window.location?.hostname ?? "")
    for (const name of names) {
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/${domain ? `; Domain=${domain}` : ""}${secure}`
      }
    }
  } catch {
    // 쿠키 접근이 막힌 문맥(샌드박스 iframe 등) — 정리는 건너뛴다.
  }
  return names
}

/** 앞 선택에서 켜져 있던 범주가 지금 꺼졌는가. 미결정은 모두 꺼진 것으로 본다. */
export function isConsentWithdrawal(before: ConsentChoice, after: ConsentChoice): boolean {
  return (before.analytics && !after.analytics) || (before.marketing && !after.marketing)
}

// 동의 뒤에만 붙는 외부 스크립트(AppChrome·ChannelTalkLoader). 철회해도 DOM 과 메모리에 남는다.
const TRACKER_SCRIPT_SELECTOR = [
  "googletagmanager.com",
  "google-analytics.com",
  "connect.facebook.net",
  "wcs.naver.net",
  "daumcdn.net",
  "channel.io",
]
  .map((host) => `script[src*="${host}"]`)
  .join(",")

export function hasLoadedTrackerScripts(): boolean {
  if (!isBrowser()) return false
  try {
    return document.querySelector(TRACKER_SCRIPT_SELECTOR) !== null
  } catch {
    return false
  }
}

// 사용자가 직접 고친 칸. React 제어 입력은 defaultValue 를 value 에 맞춰 두므로 값 비교만으로는 못 찾는다.
const editedFields = new WeakSet<object>()

function rememberEditedField(event: Event) {
  if (event.target && typeof event.target === "object") editedFields.add(event.target)
}

/**
 * 새로고침하면 사라질 입력이 있는가(본문 폼·챗봇 입력창). 쿠키 배너 안의 체크 칸은 뺀다.
 * 있으면 지금 새로고침하지 않고 다음 페이지 이동 때 정리한다.
 */
export function hasUnsavedInput(): boolean {
  if (!isBrowser()) return false
  try {
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    )
    for (const field of Array.from(fields)) {
      if (field.closest("[data-consent-banner]")) continue
      const edited = editedFields.has(field)
      if (field instanceof HTMLSelectElement) {
        if (edited || Array.from(field.options).some((option) => option.selected !== option.defaultSelected)) return true
        continue
      }
      if (field instanceof HTMLInputElement) {
        if (field.type === "hidden" || field.type === "submit" || field.type === "button") continue
        if (field.type === "checkbox" || field.type === "radio") {
          if (edited || field.checked !== field.defaultChecked) return true
          continue
        }
      }
      if (field.value !== field.defaultValue) return true
      if (edited && field.value.trim() !== "") return true
    }
  } catch {
    return true
  }
  return false
}

/** 탭 A 의 철회를 탭 B 가 받았거나, 입력 중이라 미룬 정리 — 다음 앱 안 이동을 새 문서 로드로 바꾼다. */
let reloadOnNextNavigation = false

/** PageViewTracker 가 경로가 바뀔 때 한 번 묻는다. true 면 그 자리에서 새로고침한다. */
export function takeTrackerReloadOnNavigation(): boolean {
  const pending = reloadOnNextNavigation
  reloadOnNextNavigation = false
  return pending
}

// 배너가 닫힌 화면이 먼저 그려진 뒤 새로고침한다(누른 버튼이 흐린 채로 멈춰 보이지 않게).
const TRACKER_RELOAD_DELAY_MS = 150

type CleanupOrigin = "here" | "other-tab" | "restored"

/**
 * 철회 뒤 이미 불러온 추적 스크립트를 새로고침으로 내린다.
 *  - 이 탭에서 고른 경우·bfcache 에서 돌아온 경우: 입력 중인 글이 없으면 바로 새로고침한다.
 *  - 다른 탭에서 고른 경우: 이 탭이 가려져 있고 입력 중인 글이 없을 때만 바로, 아니면 다음 이동 때.
 * 철회가 아니거나(동의를 더 켬) 불러온 스크립트가 없으면(첫 방문 '필수만') 아무것도 하지 않는다.
 */
function settleLoadedTrackers(before: ConsentChoice, after: ConsentChoice, origin: CleanupOrigin) {
  if (!isConsentWithdrawal(before, after) || !hasLoadedTrackerScripts()) return
  const hiddenHere = document.visibilityState === "hidden"
  const reloadNow = !hasUnsavedInput() && (origin !== "other-tab" || hiddenHere)
  if (!reloadNow) {
    reloadOnNextNavigation = true
    return
  }
  window.setTimeout(() => {
    try {
      window.location.reload()
    } catch {
      reloadOnNextNavigation = true
    }
  }, TRACKER_RELOAD_DELAY_MS)
}

/* ── 다른 탭 동기화(쿠키 점검 C12) ──────────────────────────────────────────
 * 쿠키는 탭끼리 공유되지만 CONSENT_CHANGE_EVENT 는 같은 창 안에서만 돈다. 저장한 탭이 BroadcastChannel 로
 * 알리면 다른 탭은 쿠키를 다시 읽어 Consent Mode·픽셀 철회·구독 컴포넌트를 맞춘다. BroadcastChannel 이
 * 없거나 탭이 얼어 있던 경우는 탭이 다시 보일 때·bfcache 에서 돌아올 때 쿠키를 다시 읽어 맞춘다.
 * 메시지에는 아무 값도 싣지 않는다 — 정본은 쿠키다.
 */
const CONSENT_SYNC_CHANNEL = "cln-consent"
let consentSyncStarted = false
let lastSyncedRaw: string | null = null
let consentChannel: BroadcastChannel | null = null

function choiceFromRaw(raw: string | null): ConsentChoice {
  const record = parseConsent(raw || null)
  return record ? { analytics: record.analytics, marketing: record.marketing } : DENIED_CHOICE
}

function openConsentChannel() {
  if (consentChannel || typeof BroadcastChannel === "undefined") return
  try {
    consentChannel = new BroadcastChannel(CONSENT_SYNC_CHANNEL)
    consentChannel.onmessage = () => syncConsentFromCookie("other-tab")
  } catch {
    consentChannel = null
  }
}

// 열린 BroadcastChannel 은 bfcache 를 막거나 캐시에서 내쫓을 수 있어 페이지를 떠날 때 닫는다.
function closeConsentChannel() {
  try {
    consentChannel?.close()
  } catch {
    // 이미 닫힘
  }
  consentChannel = null
}

function notifyOtherTabs() {
  openConsentChannel()
  try {
    consentChannel?.postMessage({ type: "consent-change" })
  } catch {
    // 보낼 수 없는 문맥 — 다른 탭은 다시 보일 때 쿠키로 맞춘다.
  }
}

/** 쿠키가 이 탭이 마지막으로 본 값과 다르면(다른 탭이 저장) 이 탭의 상태를 맞춘다. */
function syncConsentFromCookie(origin: CleanupOrigin) {
  if (!isBrowser()) return
  const raw = readConsentRaw()
  if (raw === lastSyncedRaw) return
  const before = choiceFromRaw(lastSyncedRaw)
  lastSyncedRaw = raw
  const record = parseConsent(raw || null)
  const after: ConsentChoice = record ? { analytics: record.analytics, marketing: record.marketing } : DENIED_CHOICE
  applyConsentMode(after)
  if (record) expireTrackingCookies(after)
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
  settleLoadedTrackers(before, after, origin)
}

/**
 * 다른 탭 동기화를 켠다(한 번만). useConsent 가 구독할 때 부른다.
 * 이미 고른 사람이 끈 범주의 외부 쿠키가 남아 있으면(이전 버전에서 철회했거나 다른 탭에서 지운 뒤) 여기서도 지운다.
 * 미결정(정책 버전이 바뀐 재동의 대기 포함)은 아직 고르지 않은 것이라 지우지 않는다.
 */
export function startConsentSync() {
  if (consentSyncStarted || !isBrowser()) return
  consentSyncStarted = true
  lastSyncedRaw = readConsentRaw()
  const record = parseConsent(lastSyncedRaw || null)
  if (record) expireTrackingCookies(record)
  openConsentChannel()
  document.addEventListener("input", rememberEditedField, true)
  document.addEventListener("change", rememberEditedField, true)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncConsentFromCookie("other-tab")
  })
  window.addEventListener("pagehide", (event) => {
    if ((event as PageTransitionEvent).persisted) closeConsentChannel()
  })
  window.addEventListener("pageshow", (event) => {
    if (!(event as PageTransitionEvent).persisted) return
    openConsentChannel()
    syncConsentFromCookie("restored")
  })
}

interface ConsentSaveResponse {
  ok?: boolean
  record?: ConsentRecord
}

/**
 * 동의를 서버에 저장하고, 서버 Set-Cookie 반영 후 Consent Mode + 이벤트를 갱신한다.
 * 끈 범주의 외부 쿠키를 만료하고 다른 탭에 알린다. 철회였고 추적 스크립트가 이미 붙어 있으면 새로고침한다.
 */
export async function saveConsent(choice: ConsentChoice): Promise<ConsentRecord> {
  // 이 탭이 지금 반영하고 있는 선택 — 다른 탭이 먼저 바꿨어도 이 탭에 붙은 스크립트는 이 값 기준이다.
  const before = consentSyncStarted ? choiceFromRaw(lastSyncedRaw) : currentChoice()
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
    expireTrackingCookies(record)
    lastSyncedRaw = readConsentRaw()
    notifyOtherTabs()
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }))
    settleLoadedTrackers(before, record, "here")
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
