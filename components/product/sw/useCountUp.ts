"use client"

import { animate, useMotionValue } from "framer-motion"
import { useEffect, useState } from "react"

/* ── CountUp Hook ────────────────────────────────────────────────── */
export function useCountUp(target: number, trigger: boolean, duration = 2) {
    const [value, setValue] = useState(0)
    const mv = useMotionValue(0)
    useEffect(() => {
        if (!trigger) return
        const unsub = mv.on("change", (v) => setValue(Math.round(v)))
        animate(mv, target, { duration, ease: "easeOut" })
        return unsub
    }, [trigger, target, duration, mv])
    return value
}
