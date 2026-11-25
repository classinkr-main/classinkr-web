"use client"

import type { ConsentReopenDetail } from "@/components/consent/banner-presence"
import { OPEN_CONSENT_EVENT } from "@/lib/consent/consent"
import { cn } from "@/lib/utils"

/**
 * 푸터 등에서 쿠키 동의 배너를 다시 열기 위한 버튼(동의 철회·변경권 충족).
 * 보이는 높이 24px 이상, 누르는 영역은 hit-area 로 44px(쿠키 점검 C21). 배너를 닫으면 이 버튼으로 포커스가 돌아온다.
 */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={(event) =>
        window.dispatchEvent(
          new CustomEvent<ConsentReopenDetail>(OPEN_CONSENT_EVENT, {
            detail: { returnFocus: event.currentTarget },
          }),
        )
      }
      className={cn("hit-area inline-flex min-h-6 cursor-pointer items-center", className)}
    >
      쿠키 설정
    </button>
  )
}
