"use client"

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react"

type RevealState = "idle" | "out" | "in"

type RevealProps = {
  children: ReactNode
  /** Render as a different element (e.g. "li", "section"). Defaults to div. */
  as?: ElementType
  /** Extra stagger delay in ms applied to the transition. */
  delay?: number
  className?: string
}

/**
 * SSR-safe scroll reveal.
 *
 * The element is fully visible on the server and on first client paint
 * (`state === "idle"` → no animation class). After mount we arm the hidden
 * pre-animation state and observe; intersection flips it to "in". If JS never
 * runs the content stays visible. `prefers-reduced-motion` is handled globally
 * in globals.css (the element is forced visible), so it simply appears.
 *
 * State transitions are scheduled with requestAnimationFrame so we never call
 * setState synchronously inside the effect body.
 */
export function Reveal({ children, as, delay = 0, className = "" }: RevealProps) {
  const Tag = (as ?? "div") as ElementType
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<RevealState>("idle")

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      // Leave it as visible "idle" — no motion needed.
      return
    }

    let frame = 0
    let observer: IntersectionObserver | null = null

    // Arm the hidden state on the next frame (async — avoids a sync setState
    // in the effect body and lets the browser paint the visible state first).
    frame = window.requestAnimationFrame(() => {
      setState("out")
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setState("in")
              observer?.disconnect()
              break
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
      )
      observer.observe(node)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [])

  return (
    <Tag
      ref={ref}
      data-reveal={state === "idle" ? undefined : state}
      style={state !== "idle" && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${className} ${state === "idle" ? "" : "reveal-anim"}`.trim()}
    >
      {children}
    </Tag>
  )
}
