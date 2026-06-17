"use client"

import Image from "next/image"
import Link from "next/link"
import { X } from "lucide-react"
import { useEffect, useState } from "react"

import {
  DENIED_CHOICE,
  GRANTED_CHOICE,
  OPEN_CONSENT_EVENT,
  type ConsentChoice,
} from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"

const primaryBtn =
  "inline-flex h-9 items-center justify-center rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#065c41]"
const ghostBtn =
  "inline-flex h-9 items-center justify-center rounded-md border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-[#3f4a44] transition-colors hover:bg-[#F6F5F4]"

function ConsentRow({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  disabled?: boolean
  onChange?: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md bg-white px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734] disabled:opacity-50"
      />
      <span className="flex flex-col">
        <span className="text-[13px] font-semibold text-[#111110]">{label}</span>
        <span className="text-[12px] leading-snug text-[#6b756f]">{desc}</span>
      </span>
    </label>
  )
}

/**
 * 옵트인 쿠키 동의 배너 (PIPA/GDPR). 미결정 시 자동 노출되며, 동의 전에는
 * 마케팅/분석 픽셀이 발화하지 않는다(AppChrome + lib/analytics 게이팅).
 * 푸터 "쿠키 설정"에서 재오픈 가능.
 */
export function ConsentBanner() {
  const { decided, choice, save } = useConsent()
  const [forceOpen, setForceOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [draft, setDraft] = useState<ConsentChoice>(DENIED_CHOICE)

  // 푸터 "쿠키 설정"에서 재오픈 (이벤트 콜백 내 setState — effect 본문 아님)
  useEffect(() => {
    const reopen = () => {
      setDraft({ analytics: choice.analytics, marketing: choice.marketing })
      setShowSettings(true)
      setForceOpen(true)
    }
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [choice.analytics, choice.marketing])

  // open 상태는 렌더에서 파생 — 미결정이면 자동 노출, 닫으면 숨김, 재오픈 시 강제 노출
  const open = forceOpen || (!decided && !dismissed)
  if (!open) return null

  const dismiss = () => {
    setForceOpen(false)
    setDismissed(true)
    setShowSettings(false)
  }
  const acceptAll = () => {
    save(GRANTED_CHOICE)
    dismiss()
  }
  const rejectAll = () => {
    save(DENIED_CHOICE)
    dismiss()
  }
  const saveSelected = () => {
    save(draft)
    dismiss()
  }
  const openSettings = () => {
    setDraft({ analytics: choice.analytics, marketing: choice.marketing })
    setShowSettings(true)
  }

  return (
    <div
      role="dialog"
      aria-label="쿠키 사용 동의"
      className="fixed bottom-3 left-3 right-3 z-[70] sm:bottom-6 sm:left-6 sm:right-auto"
    >
      <div className="relative w-full max-w-[400px] rounded-lg border border-black/[0.08] bg-white p-4 pr-12 shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:p-5 sm:pr-12">
        <button
          type="button"
          onClick={dismiss}
          aria-label="쿠키 배너 닫기"
          title="닫기"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] focus:outline-none focus:ring-2 focus:ring-[#084734]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex flex-col gap-3.5">
          <div className="flex items-start gap-3">
            <Image
              src="/images/consent/cookie-crayon.png"
              alt=""
              width={48}
              height={48}
              aria-hidden="true"
              className="mt-0.5 h-11 w-11 shrink-0 object-contain"
            />
            <div className="space-y-1.5">
              <p className="text-[15px] font-bold text-[#111110]">쿠키를 조금만 사용할게요</p>
              <p className="text-[13px] leading-relaxed text-[#5b6660]">
                잠깐 양해 부탁드려요. 사이트가 잘 열리고 상담 신청이 매끄럽게 이어지도록 꼭 필요한 쿠키를 씁니다.
                분석·마케팅 쿠키는 선택해 주신 경우에만 조심히 켤게요. 자세한 내용은{" "}
                <Link
                  href="/privacy"
                  prefetch={false}
                  className="font-medium text-[#084734] underline underline-offset-2"
                >
                  개인정보처리방침
                </Link>
                에서 확인하실 수 있습니다.
              </p>
            </div>
          </div>

          {showSettings ? (
            <div className="grid gap-2 rounded-lg bg-[#F6F5F4] p-3">
              <p className="px-1 text-[12px] leading-relaxed text-[#615D59]">
                필요한 것만 가볍게 골라 주세요. 선택하지 않아도 사이트의 기본 기능은 그대로 이용할 수 있어요.
              </p>
              <ConsentRow
                label="필수"
                desc="보안, 페이지 이동, 상담 신청처럼 사이트가 제대로 움직이는 데 꼭 필요해요. 이 쿠키는 항상 켜져 있어요."
                checked
                disabled
              />
              <ConsentRow
                label="분석"
                desc="어떤 페이지가 도움이 됐는지 살펴보고, 덜 불편한 사이트로 다듬는 데 써요."
                checked={draft.analytics}
                onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
              />
              <ConsentRow
                label="마케팅"
                desc="광고 성과를 확인하고, 관심 있어 보이는 안내를 더 알맞게 보여드릴 때 써요."
                checked={draft.marketing}
                onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {showSettings ? (
              <button type="button" onClick={saveSelected} className={primaryBtn}>
                선택 저장
              </button>
            ) : (
              <>
                <button type="button" onClick={openSettings} className={ghostBtn}>
                  상세 설정
                </button>
                <button type="button" onClick={rejectAll} className={ghostBtn}>
                  필수만 사용
                </button>
                <button type="button" onClick={acceptAll} className={primaryBtn}>
                  모두 동의
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
