"use client"

import { usePathname, useSearchParams } from "next/navigation"
import Script from "next/script"
import { useEffect } from "react"
import { NAVER_WCS_ID } from "@/lib/analytics-config"

/**
 * 네이버 프리미엄 로그분석 + 광고 전환 추적 (wcs.trans 신 스크립트).
 *
 * ⚠️ 구 스크립트(wcs.cnv)와 **섞어 쓰지 않는다.** 같은 전환 유형에서 신 스크립트 전환이
 * 한 번 발생하면 그 유형의 구 스크립트 전환은 네이버 쪽에서 **영구 필터링**된다. 그래서
 * 처음부터 trans 로만 간다 — 이 저장소에 cnv 호출이 생기면 그건 회귀다.
 *
 * ⚠️ 스크립트만 넣는다고 데이터가 쌓이지 않는다. 네이버 **검수 신청**을 통과해야 수집이
 * 시작된다. 검수 전에는 화면·대시보드가 조용히 0 이므로, 0 을 성과로 읽지 말 것.
 *
 * 마운트 위치: AppChrome 의 `consentChoice.marketing` 게이트 안 — 동의 없는 마케팅 픽셀
 * 발화는 플레이북 위반이다(Meta Pixel 과 같은 자리).
 *
 * 전환 발화(wcs.trans)는 여기서 하지 않는다. 공통 스크립트는 페이지뷰(wcs_do)까지만 맡고,
 * 전환은 실제 전환 지점(리드 제출 성공 등)에서 lib/analytics.ts 가 부른다 — 그래야
 * "폼을 열었다"가 전환으로 새지 않는다.
 */
export function NaverAnalyticsScript() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const isInternal =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/receipt")

  // 소프트 내비게이션에는 스크립트 태그가 다시 실행되지 않는다 — 경로가 바뀔 때마다
  // 직접 wcs_do 를 한 번 더 호출해야 SPA 이동이 페이지뷰로 잡힌다.
  useEffect(() => {
    if (isInternal || !NAVER_WCS_ID) return
    let timeout: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const sendPageView = () => {
      const wcs = window.wcs
      if (wcs && typeof window.wcs_do === "function") {
        // wcs_add.wa 는 부트스트랩에서 이미 설정됐다. inflow 는 쿠키 도메인 설정이라 1회면 된다.
        window.wcs_do()
        return
      }
      attempts += 1
      if (attempts <= 20) timeout = setTimeout(sendPageView, 250)
    }

    sendPageView()
    return () => {
      if (timeout) clearTimeout(timeout)
    }
    // search 를 의존성에 넣는 이유: 같은 pathname 이라도 쿼리가 바뀌면 다른 유입이다.
  }, [isInternal, pathname, search])

  if (isInternal || !NAVER_WCS_ID) return null

  return (
    <>
      <Script id="naver-wcs-src" src="https://wcs.naver.net/wcslog.js" strategy="afterInteractive" />
      <Script id="naver-wcs-init" strategy="afterInteractive">
        {`if(!window.wcs_add)window.wcs_add={};window.wcs_add["wa"]=${JSON.stringify(NAVER_WCS_ID)};if(window.wcs){window.wcs.inflow();window.wcs_do();}`}
      </Script>
    </>
  )
}
