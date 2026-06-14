"use client"

import { OPEN_CONSENT_EVENT } from "@/lib/consent/consent"

/** 푸터 등에서 쿠키 동의 배너를 다시 열기 위한 버튼(동의 철회·변경권 충족). */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className={className}
    >
      쿠키 설정
    </button>
  )
}
