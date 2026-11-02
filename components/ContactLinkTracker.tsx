"use client"

import { useEffect } from "react"

import { trackEvent } from "@/lib/analytics"

const CONTACT_LINK_SELECTOR = 'a[href^="tel:" i], a[href^="mailto:" i]'

/**
 * 위치 라벨. 링크에 `data-track-location` 이 있으면 그것을 쓰고, 없으면 바깥 랜드마크로
 * 짐작한다(푸터·헤더). 그것도 없으면 unknown.
 */
export function resolveContactLinkLocation(anchor: HTMLAnchorElement): string {
  const explicit = anchor.dataset.trackLocation?.trim()
  if (explicit) return explicit.slice(0, 60)
  if (anchor.closest("footer")) return "footer"
  if (anchor.closest("header")) return "header"
  return "unknown"
}

/**
 * 전화(`tel:`)·메일(`mailto:`) 링크 클릭을 문서 단위로 위임해 잡는다 — 링크마다 onClick 을
 * 다는 대신 여기 한 곳에서 click_to_call·click_email 을 보낸다.
 *
 * 번호·주소 값은 절대 싣지 않는다. 위치 라벨과 현재 경로(쿼리 없음)만 보낸다.
 */
export function ContactLinkTracker() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest(CONTACT_LINK_SELECTOR)
      if (!(anchor instanceof HTMLAnchorElement)) return

      const href = anchor.getAttribute("href")?.trim().toLowerCase() ?? ""
      const eventName = href.startsWith("tel:") ? "click_to_call" : "click_email"
      trackEvent(eventName, {
        link_location: resolveContactLinkLocation(anchor),
        page_path: window.location.pathname,
      })
    }

    // 캡처 단계 — 링크 쪽 핸들러가 전파를 멈춰도 놓치지 않는다.
    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [])

  return null
}
