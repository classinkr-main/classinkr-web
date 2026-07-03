"use client"

import { LazyMotion, domAnimation } from "framer-motion"
import type { ReactNode } from "react"

/**
 * framer-motion LazyMotion 전역 프로바이더.
 * 앱 전체가 full `motion` 대신 `m` 컴포넌트를 쓰므로, 애니메이션 피처(domAnimation)는
 * 이 경계에서 한 번만 로드된다. 새 컴포넌트에서 full `motion` 컴포넌트를 import하면
 * full 번들이 다시 끌려 들어오니 반드시 `m.div` 형태를 쓸 것
 * (drag/layout 애니메이션 필요 시 domAnimation을 domMax로 교체).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
    return <LazyMotion features={domAnimation}>{children}</LazyMotion>
}
