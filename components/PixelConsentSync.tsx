"use client"

import { useEffect } from "react"

import { CONSENT_CHANGE_EVENT, currentChoice } from "@/lib/consent/consent"
import { grantMarketingPixels, revokeMarketingPixels } from "@/lib/pixels/teardown"

/**
 * 마케팅 동의 상태를 실제 픽셀에 반영하는 상주 컴포넌트.
 *
 * `AppChrome`이 `MetaPixelScript`/`AnalyticsProviders`를 언마운트하는 것만으로는
 * 이미 로드된 픽셀이 내려가지 않는다(`lib/pixels/teardown.ts` 주석 참고).
 * teardown을 그 컴포넌트들의 cleanup에 넣을 수도 없다 — `showAnalytics`가
 * `/checkout`·`/receipt`에서 false라, 동의와 무관하게 결제 화면에 들어갈 때마다
 * 철회가 오발화한다. 그래서 동의 변경 이벤트만 구독하는 별도 컴포넌트로 분리한다.
 *
 * 구독 골격은 `components/ui/ChannelTalkLoader.tsx`와 같다.
 */
export function PixelConsentSync() {
  useEffect(() => {
    let lastMarketing = currentChoice().marketing

    // 최초 마운트: 동의가 없으면 남아 있을 수 있는 광고 쿠키를 정리한다.
    // 동의가 있는 경우는 아무것도 하지 않는다 — 픽셀 로드는 AppChrome이 맡고,
    // 여기서 손대면 스크립트 주입이 중복될 수 있다.
    if (!lastMarketing) revokeMarketingPixels()

    const sync = () => {
      const marketing = currentChoice().marketing
      if (marketing === lastMarketing) return
      lastMarketing = marketing
      if (marketing) grantMarketingPixels()
      else revokeMarketingPixels()
    }

    window.addEventListener(CONSENT_CHANGE_EVENT, sync)
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync)
  }, [])

  return null
}
