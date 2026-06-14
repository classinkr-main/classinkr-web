"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import {
  DENIED_CHOICE,
  GRANTED_CHOICE,
  OPEN_CONSENT_EVENT,
  type ConsentChoice,
} from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"

const primaryBtn =
  "inline-flex h-10 items-center justify-center rounded-xl bg-[#084734] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#065c41]"
const ghostBtn =
  "inline-flex h-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white px-5 text-[13px] font-semibold text-[#3f4a44] transition-colors hover:bg-[#F6F5F4]"

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
    <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white px-3 py-2.5">
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
      className="fixed inset-x-0 bottom-0 z-[70] px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <p className="text-[15px] font-bold text-[#111110]">쿠키 사용 동의</p>
            <p className="text-[13px] leading-relaxed text-[#5b6660]">
              서비스 운영에 필요한 필수 쿠키 외에 분석·마케팅 쿠키는 동의하신 경우에만 사용합니다. 자세한 내용은{" "}
              <Link
                href="/privacy"
                className="font-medium text-[#084734] underline underline-offset-2"
              >
                개인정보처리방침
              </Link>
              에서 확인하실 수 있습니다.
            </p>
          </div>

          {showSettings ? (
            <div className="grid gap-2 rounded-xl bg-[#F6F5F4] p-3">
              <ConsentRow label="필수" desc="서비스 운영에 반드시 필요 (항상 사용)" checked disabled />
              <ConsentRow
                label="분석"
                desc="방문·이용 통계로 서비스를 개선합니다"
                checked={draft.analytics}
                onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
              />
              <ConsentRow
                label="마케팅"
                desc="광고 성과 측정 및 맞춤 광고 (Meta·Kakao·Naver 등)"
                checked={draft.marketing}
                onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {showSettings ? (
              <button type="button" onClick={saveSelected} className={primaryBtn}>
                선택 저장
              </button>
            ) : (
              <>
                <button type="button" onClick={openSettings} className={ghostBtn}>
                  설정
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
