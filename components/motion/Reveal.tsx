"use client"

import { motion, type MotionProps, type MotionStyle } from "framer-motion"
import type { ReactNode } from "react"

const MOTION_TAGS = {
    div: motion.div,
    p: motion.p,
    h2: motion.h2,
    h3: motion.h3,
    span: motion.span,
    figure: motion.figure,
    section: motion.section,
    a: motion.a,
    tr: motion.tr,
} as const

type RevealTag = keyof typeof MOTION_TAGS

export type RevealProps = Pick<
    MotionProps,
    "initial" | "animate" | "whileInView" | "whileHover" | "whileTap" | "viewport" | "transition"
> & {
    as?: RevealTag
    id?: string
    className?: string
    style?: MotionStyle
    children?: ReactNode
}

/**
 * 서버 컴포넌트 섹션에서 framer-motion 등장 애니메이션만 클라이언트로 격리하는 래퍼.
 * motion props는 JSON 직렬화 가능한 값만 넘긴다(함수/ref 불가).
 */
export function Reveal({ as = "div", id, className, style, children, ...motionProps }: RevealProps) {
    const Tag = MOTION_TAGS[as]
    return (
        <Tag id={id} className={className} style={style} {...motionProps}>
            {children}
        </Tag>
    )
}
