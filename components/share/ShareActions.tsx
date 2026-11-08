"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { Check, Link2, MessageCircleMore, Share2 } from "lucide-react"

import { InstagramGlyph, KakaoGlyph } from "@/components/auth/brand-glyphs"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { trackEvent } from "@/lib/analytics"
import { getKakaoJsKey, loadKakaoSdk, shareToKakao } from "@/lib/share/kakao-share"
import {
  INSTAGRAM_DIRECT_INBOX_URL,
  buildShareText,
  buildSmsHref,
  copyText,
  detectSharePlatform,
  isShareAbort,
  type ShareChannel,
} from "@/lib/share/share-links"
import { cn } from "@/lib/utils"

// SSR 에서는 false, 클라이언트에서 navigator.share 지원 여부 — hydration 불일치 없이 읽기
const noopSubscribe = () => () => {}
const useCanNativeShare = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

const COPIED_MS = 2000
const COPY_FAILED = "링크를 복사하지 못했어요. 주소창의 링크를 복사해 주세요."

interface ShareActionsProps {
  title: string
  /** 절대 URL (서버에서 toAbsoluteUrl 로 만들어 넘긴다). 카카오톡 카드는 이 주소의 OG 태그로 그려진다 */
  url: string
  /** 계측 접두어. click_cta 의 button 이 `${source}_share_${채널}` 이 된다(예: blog_share_copy) */
  source: string
  /** 묶음 이름(스크린리더) */
  label?: string
  className?: string
}

/**
 * 공유 버튼 묶음 — 링크 복사 · 카카오톡 · 인스타그램 · 문자 메시지 (+ 공유 시트가 있는 기기에서 '다른 앱').
 *
 * - 링크 복사: 버튼이 체크로 바뀌고(2초) '링크를 복사했어요' 토스트를 띄운다.
 * - 카카오톡: NEXT_PUBLIC_KAKAO_JS_KEY 가 있으면 카카오 공유 창(친구·채팅방 선택)을 바로 연다.
 *   키가 없거나 SDK 를 못 받으면 휴대폰은 공유 시트, 데스크톱은 링크 복사 + 안내로 대신한다.
 * - 인스타그램: 웹 공유 주소가 없어 휴대폰은 공유 시트(인스타그램 선택), 데스크톱은 링크 복사 뒤 DM 함을 새 탭으로 연다.
 * - 문자: 휴대폰은 본문(제목 + 주소)이 채워진 문자 앱을 연다. 데스크톱은 링크 복사 + 안내.
 * 외형은 controls 스펙의 '본문에 홀로 서는 아이콘 버튼' = line icon-md(44px, 글리프 20px, 단색)다.
 */
export function ShareActions({ title, url, source, label = "공유하기", className }: ShareActionsProps) {
  const toast = useToast()
  const canNativeShare = useCanNativeShare()
  const [doneChannel, setDoneChannel] = useState<ShareChannel | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  // 카카오 SDK 는 버튼이 붙은 뒤 한가할 때 미리 받는다(클릭 뒤 받으면 데스크톱 팝업이 막힐 수 있다). 키가 없으면 아무것도 하지 않는다.
  useEffect(() => {
    if (!getKakaoJsKey()) return
    const preload = () => {
      loadKakaoSdk().catch(() => {
        // 못 받아도 클릭 때 다시 시도하고, 그래도 안 되면 대체 경로로 간다
      })
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(preload, 1500)
    return () => clearTimeout(id)
  }, [])

  const track = (channel: ShareChannel) => {
    trackEvent("click_cta", { button: `${source}_share_${channel}`, source, page: url })
  }

  const markDone = (channel: ShareChannel) => {
    setDoneChannel(channel)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDoneChannel(null), COPIED_MS)
  }

  const platform = () =>
    typeof navigator === "undefined"
      ? detectSharePlatform("")
      : detectSharePlatform(navigator.userAgent, navigator.maxTouchPoints)

  /** 링크를 복사하고 토스트로 알린다. hint 는 붙여 넣을 곳 안내 */
  const copyWithToast = async (channel: ShareChannel, hint?: string) => {
    const ok = await copyText(url)
    if (!ok) {
      toast.error(COPY_FAILED)
      return false
    }
    markDone(channel)
    toast.success(hint ? `링크를 복사했어요. ${hint}` : "링크를 복사했어요")
    return true
  }

  /** 휴대폰 공유 시트. 열었거나 사용자가 닫았으면 true, 지원하지 않거나 실패하면 false */
  const openShareSheet = async () => {
    if (!canNativeShare) return false
    try {
      await navigator.share({ title, url })
      return true
    } catch (error) {
      return isShareAbort(error)
    }
  }

  const handleCopy = async () => {
    track("copy")
    await copyWithToast("copy")
  }

  const handleKakao = async () => {
    track("kakao")
    if (getKakaoJsKey() && (await shareToKakao(url))) {
      markDone("kakao")
      return
    }
    if (platform().isMobile && (await openShareSheet())) return
    await copyWithToast("kakao", "카카오톡 대화방에 붙여 넣어 보내 주세요.")
  }

  const handleInstagram = async () => {
    track("instagram")
    const { isMobile } = platform()
    if (isMobile && (await openShareSheet())) return
    const copied = await copyWithToast("instagram", "인스타그램 DM에 붙여 넣어 보내 주세요.")
    if (copied && !isMobile) window.open(INSTAGRAM_DIRECT_INBOX_URL, "_blank", "noopener,noreferrer")
  }

  const handleSms = async () => {
    track("sms")
    const current = platform()
    if (current.isMobile) {
      markDone("sms")
      window.location.href = buildSmsHref(buildShareText(title, url), current)
      return
    }
    await copyWithToast("sms", "메시지에 붙여 넣어 보내 주세요.")
  }

  const handleNative = async () => {
    track("native")
    if (await openShareSheet()) return
    await copyWithToast("native")
  }

  const copied = doneChannel === "copy"

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      <ShareButton
        label={copied ? "링크 복사됨" : "링크 복사"}
        active={copied}
        onClick={handleCopy}
      >
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      </ShareButton>
      <ShareButton label="카카오톡으로 보내기" active={doneChannel === "kakao"} onClick={handleKakao}>
        <KakaoGlyph className="size-5" />
      </ShareButton>
      <ShareButton label="인스타그램으로 보내기" active={doneChannel === "instagram"} onClick={handleInstagram}>
        <InstagramGlyph className="size-5" />
      </ShareButton>
      <ShareButton label="문자 메시지로 보내기" active={doneChannel === "sms"} onClick={handleSms}>
        <MessageCircleMore aria-hidden />
      </ShareButton>
      {canNativeShare ? (
        <ShareButton label="다른 앱으로 공유" active={doneChannel === "native"} onClick={handleNative}>
          <Share2 aria-hidden />
        </ShareButton>
      ) : null}
    </div>
  )
}

function ShareButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="line"
      size="icon-md"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("[&_svg]:size-5", active && "border-fg-accent text-fg-accent hover:border-fg-accent")}
    >
      {children}
    </Button>
  )
}
