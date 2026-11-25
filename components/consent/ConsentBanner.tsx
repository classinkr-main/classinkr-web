"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronDown, X } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import {
  isChatbotSlotHidden,
  setConsentBannerOpen,
  type ConsentReopenDetail,
} from "@/components/consent/banner-presence"
import { CHATBOT_OPEN_EVENT } from "@/lib/chatbot/open-chatbot"
import {
  DENIED_CHOICE,
  GRANTED_CHOICE,
  OPEN_CONSENT_EVENT,
  type ConsentChoice,
} from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"
import { cn } from "@/lib/utils"

// 말풍선 왼쪽의 그림 — 쿠키 먹는 정글 갈매기(DESIGN.md 결정 로그 V22).
// 192px 정사각 투명 WebP 를 48px 로 보인다. 바꿀 때는 이 경로 하나만 고친다
const MASCOT_SRC = "/images/consent/gull-cookie.webp"

// 컴팩트 컨트롤 — 보이는 높이 32px(min-h-8)·글자 14px, 누르는 영역은 hit-area 로 44px 보장(쿠키 점검 C20)
const BTN =
  "hit-area inline-flex min-h-8 flex-1 items-center justify-center rounded-(--radius-control) px-2 text-caption font-semibold transition-colors duration-(--motion-fast) ease-soft disabled:opacity-40"
// 거절(필수만)과 동의(모두 동의·선택 저장)는 같은 모양이다 — 한쪽만 눈에 띄게 두지 않는다
const CHOICE_BTN = `${BTN} border border-line-strong bg-surface-sunken text-fg-body hover:border-line-ink hover:text-fg-ink`

const OPTIONAL_ROWS: Array<{ key: keyof ConsentChoice; label: string; desc: string }> = [
  { key: "analytics", label: "분석", desc: "방문 통계 · Google(미국)" },
  { key: "marketing", label: "마케팅", desc: "광고·상담창 · Google·Meta(미국), 카카오, 채널톡" },
]

// 처음 뜰 때 화면 읽기 프로그램에 한 번 알린다(포커스는 가져가지 않는다, C5·C6)
const FIRST_SHOW_ANNOUNCEMENT = "쿠키 사용 동의 창이 화면 아래에 열렸어요. 필수만 또는 모두 동의를 골라 주세요."
const ANNOUNCE_DELAY_MS = 400
// 휴대폰은 배너가 떠 있는 동안 챗봇을 숨긴다(site-base.css). 그때 '챗봇에게 묻기'를 누르면 열림은 예약되고 이 줄을 보인다(CX-05)
const CHATBOT_WAIT_NOTICE = "쿠키 선택 뒤 챗봇이 열려요"

type FocusTarget = "toggle" | "region"
type CloseFocus = HTMLElement | "auto"

/**
 * 배너가 닫힌 뒤 포커스를 둘 곳. 배너가 사라지면 포커스가 body 로 떨어지므로(C6):
 * 다시 연 사람은 누른 버튼으로, 첫 방문은 배너 때문에 미뤄 둔 챗봇 창이나 본문으로 보낸다.
 * 그 사이 사용자가 다른 곳을 눌렀으면 건드리지 않는다.
 */
function restoreFocusAfterBanner(target: CloseFocus) {
  const active = document.activeElement
  if (active && active !== document.body) return
  if (target !== "auto" && target.isConnected) {
    target.focus()
    return
  }
  const dialog = document.getElementById("classin-chatbot-dialog")
  if (dialog) {
    // 정밀 포인터는 입력창, 터치는 키보드가 갑자기 뜨지 않게 제목(포커스 가능할 때)이나 런처로 보낸다
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    const next = finePointer
      ? dialog.querySelector("textarea")
      : document.querySelector("#classin-chatbot-title[tabindex]") ??
        document.querySelector('[aria-controls="classin-chatbot-dialog"]')
    if (next instanceof HTMLElement) {
      next.focus({ preventScroll: true })
      return
    }
  }
  document.getElementById("main")?.focus({ preventScroll: true })
}

/**
 * 옵트인 쿠키 동의 배너 (PIPA/GDPR). 미결정 시 자동 노출되며, 동의 전에는
 * 마케팅/분석 픽셀이 발화하지 않는다(AppChrome + lib/analytics 게이팅).
 * 푸터 "쿠키 설정"에서 재오픈 가능 — 이때는 세부 설정을 펼친 채로 열고 첫 체크 칸으로 포커스를 옮긴다.
 *
 * 모양: 그림 + 말풍선. 평소엔 한 줄 안내와 버튼 2개(필수만 · 모두 동의), '설정'을 누르면
 * 그 자리에서 분석·마케팅을 골라 저장한다. 첫 방문에는 닫기(X)를 두지 않는다 — 거절(필수만)이 동의만큼 쉽다.
 * 다시 연 배너에만 닫기와 Esc 를 둔다. 닫으면 아무것도 저장하지 않는다(C7).
 * DOM 은 AppChrome 의 스킵 링크 바로 뒤에 놓여 Tab 두 번 안에 닿는다. 포커스를 가두지는 않는다(C5).
 */
export function ConsentBanner() {
  const { decided, choice, save } = useConsent()
  const [forceOpen, setForceOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState<ConsentChoice>(DENIED_CHOICE)
  const [chatbotNotice, setChatbotNotice] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget; seq: number } | null>(null)
  const panelId = useId()
  const regionRef = useRef<HTMLDivElement | null>(null)
  const firstToggleRef = useRef<HTMLInputElement | null>(null)
  // 다시 연 버튼(푸터 '쿠키 설정'). 닫거나 저장하면 여기로 포커스를 돌려준다
  const returnFocusRef = useRef<HTMLElement | null>(null)
  // 이번 닫힘 뒤에 포커스를 보낼 곳. 저장 응답보다 동의 상태 갱신이 먼저 그려질 수 있어 저장 전에 정해 둔다
  const closeFocusRef = useRef<CloseFocus | null>(null)
  const wasOpenRef = useRef(false)

  // open 상태는 렌더에서 파생 — 미결정이면 자동 노출, 재오픈 시 강제 노출
  const open = forceOpen || !decided
  const autoShown = open && !forceOpen
  // 닫기·Esc 는 이미 고른 사람이 다시 연 경우만. 첫 방문(미결정)은 고르기 전까지 닫지 않는다
  const dismissible = forceOpen && decided

  const requestFocus = useCallback(
    (target: FocusTarget) => setFocusRequest((prev) => ({ target, seq: (prev?.seq ?? 0) + 1 })),
    [],
  )
  // 저장하지 않고 닫는다(다시 연 배너의 닫기·Esc). 포커스는 다시 연 버튼으로 돌아간다
  const closeWithoutSaving = useCallback(() => {
    closeFocusRef.current = returnFocusRef.current ?? "auto"
    returnFocusRef.current = null
    setForceOpen(false)
    setExpanded(false)
    setFailed(false)
    setChatbotNotice(false)
  }, [])

  // 푸터 "쿠키 설정"에서 재오픈 (이벤트 콜백 내 setState — effect 본문 아님)
  useEffect(() => {
    const reopen = (event: Event) => {
      const detail = (event as CustomEvent<ConsentReopenDetail | null>).detail
      const active = document.activeElement
      returnFocusRef.current =
        detail?.returnFocus ?? (active instanceof HTMLElement && active !== document.body ? active : null)
      setDraft({ analytics: choice.analytics, marketing: choice.marketing })
      setFailed(false)
      setExpanded(true)
      setForceOpen(true)
      requestFocus("toggle")
    }
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [choice.analytics, choice.marketing, requestFocus])

  // 배너가 챗봇을 가린 채로 챗봇 열기 요청이 오면(휴대폰 + 문서 '챗봇에게 묻기') 무반응으로 두지 않는다.
  // 열림 예약은 챗봇이 그대로 갖고, 배너는 안내 한 줄을 보이며 포커스를 받는다. 데스크톱은 챗봇이 보이므로 그냥 열린다
  useEffect(() => {
    if (!open) return
    const onChatbotOpen = () => {
      if (!isChatbotSlotHidden()) return
      setChatbotNotice(true)
      requestFocus("region")
    }
    window.addEventListener(CHATBOT_OPEN_EVENT, onChatbotOpen)
    return () => window.removeEventListener(CHATBOT_OPEN_EVENT, onChatbotOpen)
  }, [open, requestFocus])

  // 첫 방문 자동 노출 때 한 번 알린다. 빈 알림 영역이 먼저 그려진 뒤 글을 넣어야 읽힌다
  useEffect(() => {
    if (!autoShown) return
    const timer = window.setTimeout(() => setAnnouncement(FIRST_SHOW_ANNOUNCEMENT), ANNOUNCE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [autoShown])

  useEffect(() => {
    if (!focusRequest) return
    const target = focusRequest.target === "toggle" ? firstToggleRef.current ?? regionRef.current : regionRef.current
    target?.focus()
  }, [focusRequest])

  // 열림·닫힘을 다른 위젯(챗봇 티저)에 알리고, 닫힌 직후 포커스를 정리한다
  useEffect(() => {
    setConsentBannerOpen(open)
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (open || !wasOpen) return
    const pending = closeFocusRef.current
    closeFocusRef.current = null
    if (pending) restoreFocusAfterBanner(pending)
  }, [open])

  useEffect(() => () => setConsentBannerOpen(false), [])

  // 다시 연 배너는 Esc 로 닫는다. 배너 안에서 누른 Esc 가 챗봇 창까지 닫지 않게 여기서 멈춘다
  useEffect(() => {
    const region = regionRef.current
    if (!region || !dismissible || saving) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      event.stopPropagation()
      closeWithoutSaving()
    }
    region.addEventListener("keydown", onKeyDown)
    return () => region.removeEventListener("keydown", onKeyDown)
  }, [dismissible, saving, closeWithoutSaving])

  if (!open) return null

  // 저장이 실패하면(네트워크·429 등) 닫지 않고 다시 누르라고 알린다 — 아무 일 없는 것처럼 두지 않는다
  const commitChoice = async (nextChoice: ConsentChoice) => {
    if (saving) return
    setSaving(true)
    setFailed(false)
    closeFocusRef.current = returnFocusRef.current ?? "auto"
    try {
      await save(nextChoice)
      returnFocusRef.current = null
      setForceOpen(false)
      setExpanded(false)
      setChatbotNotice(false)
    } catch (error) {
      closeFocusRef.current = null
      console.warn("[consent] failed to save consent:", error)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }
  // 다시 연 배너만: 아무것도 저장하지 않고 닫는다
  const dismiss = () => {
    if (!dismissible || saving) return
    closeWithoutSaving()
  }
  const toggleSettings = () => {
    if (!expanded) setDraft({ analytics: choice.analytics, marketing: choice.marketing })
    setExpanded((v) => !v)
  }

  const liveText = chatbotNotice ? CHATBOT_WAIT_NOTICE : autoShown ? announcement : ""

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label="쿠키 사용 동의"
      tabIndex={-1}
      data-consent-banner
      data-inert-with-menu="hide"
      className="group fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-3 z-(--z-consent) flex max-w-[calc(100vw-24px)] items-end gap-1 sm:bottom-5 sm:left-5"
    >
      <Image
        src={MASCOT_SRC}
        alt=""
        width={192}
        height={192}
        aria-hidden="true"
        className="-mb-0.5 size-12 shrink-0 select-none object-contain transition-transform duration-(--motion-base) ease-soft group-hover:-rotate-6"
      />

      {/* 말풍선 — 꼬리는 갈매기 부리·볼 쪽(왼쪽 아래)을 향한다. 꼬리가 잘리지 않게 스크롤은 안쪽 상자가 맡는다.
          폭은 rem 이라 글자를 키우면 함께 넓어지고, 화면 폭(양옆 여백 0.75rem씩 + 그림 3rem + 틈 0.25rem)을 넘지 않는다.
          'Google·Meta(미국),' 같은 긴 낱말은 좁을 때만 끊는다(C17, 글자 200%·320px 폭) */}
      <div
        className={cn(
          "relative min-w-0 max-w-full rounded-md border border-line-strong bg-surface-sheet shadow-deep [overflow-wrap:anywhere] before:absolute before:-left-[5px] before:bottom-3.5 before:size-2 before:rotate-45 before:border-b before:border-l before:border-line-strong before:bg-surface-sheet",
          expanded ? "w-[min(14.5rem,calc(100vw-4.75rem))]" : "w-[min(13.25rem,calc(100vw-4.75rem))]",
        )}
      >
        {/* 아래 여백 12px — 버튼(32px)의 hit-area(44px)가 아래로 6px 나온다. 모자라면 스크롤 상자가 생기고,
            스크롤바를 늘 보이는 설정에서는 처음부터 옆에 스크롤바가 뜬다 */}
        <div className="relative max-h-[calc(100dvh-24px)] overflow-y-auto px-2.5 pb-3 pt-2">
          <div className="flex items-center justify-between gap-1.5">
            <p className="min-w-0 text-label text-fg-ink">쿠키 조금만 쓸게요</p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={toggleSettings}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="hit-area -mr-1 inline-flex items-center gap-0.5 px-1 text-note text-fg-muted transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink"
              >
                설정
                <ChevronDown
                  aria-hidden
                  className={cn("size-3 transition-transform duration-(--motion-fast) ease-soft", expanded && "rotate-180")}
                />
              </button>
              {dismissible ? (
                <button
                  type="button"
                  onClick={dismiss}
                  disabled={saving}
                  aria-label="저장하지 않고 닫기"
                  className="hit-area -mr-1 inline-flex size-6 items-center justify-center text-fg-muted transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink disabled:opacity-40"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
          {chatbotNotice ? (
            <p className="mt-0.5 text-note font-semibold text-fg-ink break-keep">{CHATBOT_WAIT_NOTICE}</p>
          ) : null}
          <p className="mt-0.5 text-note text-fg-muted break-keep">
            선택 쿠키는 동의 시에만 켜요 ·{" "}
            <Link href="/privacy#cookies" prefetch={false} className="link-quiet text-fg-body whitespace-nowrap">
              자세히
            </Link>
          </p>

          {expanded ? (
            <ul id={panelId} className="mt-1.5 divide-y divide-line-hair border-t border-line-hair">
              <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1 text-note text-fg-muted">
                <span>
                  <span className="mr-1.5 font-semibold text-fg-ink">필수</span>보안·이동
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-fg-body">
                  <span aria-hidden className="status-dot" />
                  항상 켜짐
                </span>
              </li>
              {OPTIONAL_ROWS.map((row, index) => (
                <li key={row.key}>
                  <label className="flex cursor-pointer items-center justify-between gap-2 py-1 text-note text-fg-muted transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink">
                    <span className="min-w-0">
                      <span className="mr-1.5 font-semibold text-fg-ink">{row.label}</span>
                      {row.desc}
                    </span>
                    <input
                      ref={index === 0 ? firstToggleRef : undefined}
                      type="checkbox"
                      checked={draft[row.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [row.key]: e.target.checked }))}
                    />
                  </label>
                </li>
              ))}
              <li className="py-1 text-note">
                <Link href="/privacy#overseas" prefetch={false} className="link-quiet text-fg-body">
                  보내는 곳·항목·기간 자세히
                </Link>
              </li>
            </ul>
          ) : null}

          {failed ? (
            <p role="alert" className="mt-1 text-note text-fg-danger">
              저장하지 못했어요. 다시 눌러 주세요.
            </p>
          ) : null}

          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => void commitChoice(DENIED_CHOICE)}
              disabled={saving}
              className={CHOICE_BTN}
            >
              필수만
            </button>
            {expanded ? (
              <button type="button" onClick={() => void commitChoice(draft)} disabled={saving} className={CHOICE_BTN}>
                선택 저장
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void commitChoice(GRANTED_CHOICE)}
                disabled={saving}
                className={CHOICE_BTN}
              >
                모두 동의
              </button>
            )}
          </div>

          {/* 화면 읽기 알림 전용. 비어 있는 채로 먼저 그려 두고 글을 넣는다 */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {liveText}
          </p>
        </div>
      </div>
    </div>
  )
}
