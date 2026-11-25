/**
 * 채널톡 웹 메신저(client SDK) 부트 로직 — 브라우저 전용.
 *
 * 동의(consent) 정책 — [[legal-pages-two-layer]] 옵트인 쿠키 동의와 일관:
 *  - 수동 프리로드(force 아님): 마케팅 동의가 있을 때만 부트한다. 채널톡은 제3자 쿠키를
 *    심으므로 동의 전에는 로드하지 않는다(Meta Pixel / GA와 동일 기준).
 *  - force=true: 사용자가 "실시간 상담 연결"을 직접 누른 경우. 명시적·사용자 주도 요청이므로
 *    기능적 사용으로 보고 동의 여부와 무관하게 부트한다(사용자가 직접 상담을 요청한 것).
 *  - 마케팅 동의가 철회되면 shutdownChannelTalk()로 위젯/쿠키를 내린다.
 *
 * 회원/컨텍스트 식별:
 *  - memberId: 챗봇 식별값으로 만든 채널톡 회원 id. '마케팅' 동의가 있을 때만 보낸다 — force 부트(동의 없이 상담 연결)
 *    때도 동의가 없으면 bootChannelTalk 이 빼고 부트한다(쿠키 점검 C8).
 *  - profile: 챗봇 핸드오프 시 마지막 질문·인텐트·대화 요약을 상담원 프로필 패널로 넘긴다.
 *
 * 챗봇 식별값(쿠키 점검 C3, 결정 전 기본안):
 *  - 영구 값(localStorage classinkr_chatbot_anonymous_id)은 '마케팅' 동의가 있고 채널톡 키가 있을 때만 만든다.
 *    동의가 없거나 철회되면 만들지 않고 지운다(getChannelTalkAnonymousId·ChannelTalkLoader).
 *  - 그 밖에는 탭 단위 값(sessionStorage)을 쓰고, 저장소가 막히면 메모리 값을 쓴다(CX-19). 탭을 닫으면 사라진다.
 */

import { currentChoice } from "@/lib/consent/consent"
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/chatbot/browser-storage"
import { sanitizeChatbotPageUrl } from "@/lib/chatbot/pii"

declare global {
  interface Window {
    ChannelIO?: ((command: string, ...args: unknown[]) => void) & {
      q?: unknown[]
      c?: (args: unknown) => void
    }
    ChannelIOInitialized?: boolean
    ChannelIOBooted?: boolean
    __classinChannelIOBooted?: boolean
  }
}

export type ChannelTalkProfile = Record<string, string | number | boolean | null>

export interface ChannelTalkBootOptions {
  /** 사용자가 직접 상담을 요청(예: "실시간 상담 연결" 클릭) — 동의 게이팅을 우회한다. */
  force?: boolean
  /** 로그인된 회원 식별자 — 익명 대신 식별 고객으로 상담 연결. */
  memberId?: string
  /** 상담원에게 넘길 프로필 필드(마지막 질문, 챗봇 인텐트, 대화 요약 등). */
  profile?: ChannelTalkProfile
  /** 새 상담 입력창에 미리 넣을 메시지. 사용자가 전송해야 상담 수신함에 고객 메시지로 들어간다. */
  draftMessage?: string
  /** 새 UserChat이 생성될 때 붙일 상담 단위 프로필. */
  chatProfile?: ChannelTalkProfile
  /** setPage에 남길 페이지명. 없으면 현재 URL을 사용한다. */
  page?: string
}

export const CHANNEL_TALK_INTENT_EVENT = "classin:channel-talk-intent"
const CHANNEL_TALK_ANONYMOUS_ID_KEY = "classinkr_chatbot_anonymous_id"
const CHATBOT_TAB_ID_KEY = "classinkr.chatbot.tabId.v1"
// sessionStorage 까지 막힌 브라우저에서 이 페이지가 살아 있는 동안 쓰는 값.
let memoryTabAnonymousId: string | undefined

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function getChannelPluginKey() {
  return firstNonEmpty(
    process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY,
    process.env.NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY
  )
}

export function isChannelTalkConfigured() {
  return Boolean(getChannelPluginKey())
}

export function buildChannelTalkMemberId(anonymousId: string) {
  return `classin:web:${anonymousId}`.replace(/[^\w:.-]/g, "_").slice(0, 160)
}

function createAnonymousId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  )
}

/** 탭 단위 챗봇 식별값. 새로고침·같은 탭 이동에는 남고 탭을 닫으면 사라진다. sessionStorage 가 막히면 메모리 값. */
function getTabAnonymousId() {
  const stored = readBrowserStorage("session", CHATBOT_TAB_ID_KEY)
  if (stored) return stored
  const next = memoryTabAnonymousId ?? createAnonymousId()
  memoryTabAnonymousId = next
  writeBrowserStorage("session", CHATBOT_TAB_ID_KEY, next)
  return next
}

/** 영구 식별값을 써도 되는지 — '마케팅' 동의가 있고 채널톡 키가 있을 때만. */
export function canUsePersistentChatbotId() {
  return isChannelTalkConfigured() && currentChoice().marketing
}

/** 영구 식별값을 지운다('필수만' 저장·철회·동의 전). 탭 단위 값은 두어 이 탭의 대화는 이어진다. */
export function clearPersistentChatbotId() {
  removeBrowserStorage("local", CHANNEL_TALK_ANONYMOUS_ID_KEY)
}

/**
 * 챗봇 요청(anonymousId)과 채널톡 상담에 쓰는 식별값. 던지지 않는다.
 * - '마케팅' 동의가 없으면 영구 값을 지우고 탭 단위 값을 돌려준다.
 * - 동의는 있지만 채널톡 키가 없으면 영구 값을 만들지 않고 탭 단위 값을 쓴다.
 * - 동의와 키가 있으면 영구 값을 쓴다. 처음 만들 때는 이 탭에서 쓰던 탭 단위 값을 올려 서버 대화(세션)가 끊기지 않게 한다.
 */
export function getChannelTalkAnonymousId(): string | undefined {
  if (typeof window === "undefined") return undefined

  if (!currentChoice().marketing) {
    clearPersistentChatbotId()
    return getTabAnonymousId()
  }
  if (!isChannelTalkConfigured()) return getTabAnonymousId()

  const existing = readBrowserStorage("local", CHANNEL_TALK_ANONYMOUS_ID_KEY)
  if (existing) return existing

  const next = getTabAnonymousId()
  writeBrowserStorage("local", CHANNEL_TALK_ANONYMOUS_ID_KEY, next)
  return next
}

/** 채널톡 회원 id. 영구 식별값을 쓸 수 있을 때('마케팅' 동의 + 키)만 만든다 — 아니면 undefined(C3·C8). */
export function getChannelTalkMemberId(): string | undefined {
  if (!canUsePersistentChatbotId()) return undefined
  const anonymousId = getChannelTalkAnonymousId()
  return anonymousId ? buildChannelTalkMemberId(anonymousId) : undefined
}

function ensureChannelTalkStub() {
  if (typeof window === "undefined") return null
  if (window.ChannelIO) return window.ChannelIO

  const ch = function (...args: unknown[]) {
    ch.c?.(args)
  } as ((command: string, ...args: unknown[]) => void) & {
    q?: unknown[]
    c?: (args: unknown) => void
  }

  ch.q = []
  ch.c = (args) => {
    ch.q?.push(args)
  }
  window.ChannelIO = ch
  return ch
}

function loadChannelTalkScript() {
  if (typeof document === "undefined") return
  if (
    window.ChannelIOInitialized ||
    document.querySelector('script[src="https://cdn.channel.io/plugin/ch-plugin-web.js"]')
  ) {
    return
  }

  window.ChannelIOInitialized = true
  const script = document.createElement("script")
  script.type = "text/javascript"
  script.async = true
  script.src = "https://cdn.channel.io/plugin/ch-plugin-web.js"
  const first = document.getElementsByTagName("script")[0]
  first?.parentNode?.insertBefore(script, first)
}

/**
 * 채널톡 위젯을 부트한다. 마케팅 동의가 없고 force가 아니면 부트하지 않고 false를 반환한다.
 * 이미 부트된 상태에서 memberId/profile이 주어지면 updateUser로 갱신한다.
 */
export function bootChannelTalk(options: ChannelTalkBootOptions = {}): boolean {
  if (typeof window === "undefined") return false

  const pluginKey = getChannelPluginKey()
  if (!pluginKey) return false

  // 동의 게이팅: 명시적 사용자 요청(force)이 아니면 마케팅 동의 필요.
  const hasMarketingConsent = currentChoice().marketing
  if (!options.force && !hasMarketingConsent) return false
  // 동의 없이 상담을 직접 연 경우(force)에도 회원 식별값은 보내지 않는다(C8). 익명 상담으로 연다.
  const memberId = hasMarketingConsent ? options.memberId : undefined

  const channel = ensureChannelTalkStub()
  if (!channel) return false

  loadChannelTalkScript()

  if (!window.__classinChannelIOBooted) {
    window.__classinChannelIOBooted = true
    window.ChannelIOBooted = true
    const bootConfig: Record<string, unknown> = {
      pluginKey,
      hideChannelButtonOnBoot: true,
    }
    if (memberId) bootConfig.memberId = memberId
    if (options.profile) bootConfig.profile = options.profile
    channel("boot", bootConfig)
  } else if (options.profile || memberId) {
    // 이미 부트된 경우 프로필/회원 정보만 갱신(memberId는 boot 시점에만 설정 가능하므로 profile 위주).
    channel("updateUser", {
      ...(options.profile ? { profile: options.profile } : {}),
    })
  }

  return true
}

// setPage 로 상담 수신함에 남는 주소. 쿼리의 토큰·이메일이 상담원에게 가지 않게 정화한다(CX-04·C4).
function currentPageName() {
  if (typeof window === "undefined") return undefined
  return sanitizeChatbotPageUrl(window.location.href) ?? (window.location.pathname || undefined)
}

/** 사용자가 직접 상담을 요청 → force로 부트하고 메신저/새 상담을 연다. */
export function openChannelTalk(options: Omit<ChannelTalkBootOptions, "force"> = {}): boolean {
  if (!bootChannelTalk({ ...options, force: true })) return false
  if (typeof window === "undefined" || typeof window.ChannelIO !== "function") return false

  if (options.chatProfile) {
    window.ChannelIO("setPage", options.page ?? currentPageName() ?? "classin-chatbot", options.chatProfile)
  }

  const draftMessage = options.draftMessage?.trim()
  if (draftMessage) {
    // Channel Talk SDK: openChat(undefined, message)는 새 상담 입력창에 초안을 채운다.
    window.ChannelIO("openChat", undefined, draftMessage)
    return true
  }

  window.ChannelIO("showMessenger")
  return true
}

/** 동의 철회 시 위젯과 쿠키를 내린다. */
export function shutdownChannelTalk(): void {
  if (typeof window === "undefined" || typeof window.ChannelIO !== "function") return
  if (!window.__classinChannelIOBooted) return

  window.ChannelIO("shutdown")
  window.__classinChannelIOBooted = false
  window.ChannelIOBooted = false
}

/** 사이트 어디서든 채널톡 상담을 열도록 인텐트 이벤트를 발행한다(로더가 구독). */
export function requestChannelTalk(options: Omit<ChannelTalkBootOptions, "force"> = {}): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CHANNEL_TALK_INTENT_EVENT, { detail: options }))
}

export {}
