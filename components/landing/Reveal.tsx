"use client"

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react"

type RevealState = "idle" | "out" | "in"

type RevealProps = {
  children: ReactNode
  /** 다른 요소로 렌더(예: "li", "section"). 기본 div */
  as?: ElementType
  /** 기존 호출 호환용. 새 코드는 쓰지 않는다(카드·그리드 순차 금지) */
  delay?: number
  className?: string
  /** IntersectionObserver threshold. 기본 .12, 차트(DashboardPreview)는 .4 */
  threshold?: number
  /** true 면 reveal-anim(페이드·상승) 없이 data-reveal 만 단다 — 자식 모먼트 무장 전용 */
  bare?: boolean
}

/**
 * SSR 안전 스크롤 등장(X07).
 *
 * 서버·첫 페인트·JS 없음에서는 "idle" 이라 표지도 클래스도 없이 그대로 보인다.
 * 마운트 뒤 "아직 화면 밖"인 요소만 data-reveal="out" 으로 무장하고, 교차하면 "in".
 * 동작 줄이기·IntersectionObserver 없음·마운트 시 이미 화면 안이면 무장하지 않는다.
 * 미완 상태의 CSS 는 site-base.css 의 no-preference 블록에만 있다.
 */
export function Reveal({ children, as, delay = 0, className = "", threshold = 0.12, bare = false }: RevealProps) {
  const Tag = (as ?? "div") as ElementType
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<RevealState>("idle")

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || typeof IntersectionObserver === "undefined") return

    // 마운트 시 이미 화면 안이면 무장하지 않는다 — SSR 로 보이던 것이 사라졌다 나타나는 깜빡임 방지
    const rect = node.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) return

    // 60vh 보다 큰 요소는 높은 threshold 에 닿지 못한다 → .12 로 낮춘다
    const t = node.offsetHeight > window.innerHeight * 0.6 ? 0.12 : threshold
    let observer: IntersectionObserver | null = null

    // effect 안에서 동기 setState 를 피하려고 다음 프레임에 무장한다
    const frame = window.requestAnimationFrame(() => {
      setState("out")
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setState("in")
            observer?.disconnect()
          }
        },
        { threshold: t, rootMargin: "0px 0px -48px 0px" },
      )
      observer.observe(node)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [threshold])

  const armed = state !== "idle"
  return (
    <Tag
      ref={ref}
      // 빌드 HTML 예산(--budget)이 세는 정적 표지. 이 속성을 고르는 CSS 는 없다
      data-reveal-root=""
      data-reveal={armed ? state : undefined}
      style={armed && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${className} ${armed && !bare ? "reveal-anim" : ""}`.trim()}
    >
      {children}
    </Tag>
  )
}
