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
 *  - memberId: 로그인된 포털/관리자 사용자를 식별된 회원으로 연결.
 *  - profile: 챗봇 핸드오프 시 마지막 질문·인텐트·대화 요약을 상담원 프로필 패널로 넘긴다.
 */

import { currentChoice } from "@/lib/consent/consent"

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
}

export const CHANNEL_TALK_INTENT_EVENT = "classin:channel-talk-intent"
const CHANNEL_TALK_ANONYMOUS_ID_KEY = "classinkr_chatbot_anonymous_id"

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

export function getChannelTalkAnonymousId() {
  if (typeof window === "undefined") return undefined

  const existing = window.localStorage.getItem(CHANNEL_TALK_ANONYMOUS_ID_KEY)
  if (existing) return existing

  const next =
    globalThis.crypto?.randomUUID?.() ??
    `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(CHANNEL_TALK_ANONYMOUS_ID_KEY, next)
  return next
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
  if (!options.force && !currentChoice().marketing) return false

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
    if (options.memberId) bootConfig.memberId = options.memberId
    if (options.profile) bootConfig.profile = options.profile
    channel("boot", bootConfig)
  } else if (options.profile || options.memberId) {
    // 이미 부트된 경우 프로필/회원 정보만 갱신(memberId는 boot 시점에만 설정 가능하므로 profile 위주).
    channel("updateUser", {
      ...(options.profile ? { profile: options.profile } : {}),
    })
  }

  return true
}

/** 사용자가 직접 상담을 요청 → force로 부트하고 메신저를 연다. */
export function openChannelTalk(options: Omit<ChannelTalkBootOptions, "force"> = {}): boolean {
  if (!bootChannelTalk({ ...options, force: true })) return false
  if (typeof window === "undefined" || typeof window.ChannelIO !== "function") return false

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
