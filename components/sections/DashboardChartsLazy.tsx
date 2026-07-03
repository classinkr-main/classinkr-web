"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

const DashboardPreviewCharts = dynamic(
    () => import("./DashboardPreviewCharts").then((mod) => mod.DashboardPreviewCharts),
    {
        ssr: false,
        loading: () => <DashboardChartsSkeleton />,
    }
)

function DashboardChartsSkeleton() {
    return (
        <div className="grid gap-5 md:grid-cols-2" aria-hidden="true">
            {[0, 1].map((item) => (
                <div
                    key={item}
                    className="min-h-[340px] rounded-2xl border border-white/10 p-6"
                    style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}
                >
                    <div className="mb-5 h-3 w-24 rounded-full bg-white/10" />
                    <div className="mb-8 h-5 w-36 rounded-full bg-white/10" />
                    <div className="grid h-[220px] grid-cols-8 items-end gap-3">
                        {[38, 46, 58, 52, 70, 76, 84, 92].map((height, index) => (
                            <div key={index} className="rounded-t-md bg-white/10" style={{ height: `${height}%` }} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

export function DashboardChartsLazy() {
    const chartRef = useRef<HTMLDivElement | null>(null)
    const [shouldLoadCharts, setShouldLoadCharts] = useState(false)

    useEffect(() => {
        if (shouldLoadCharts) return

        const target = chartRef.current
        if (!target || !("IntersectionObserver" in window)) {
            const timeout = window.setTimeout(() => setShouldLoadCharts(true), 0)
            return () => window.clearTimeout(timeout)
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return
                setShouldLoadCharts(true)
                observer.disconnect()
            },
            { rootMargin: "360px" }
        )

        observer.observe(target)
        return () => observer.disconnect()
    }, [shouldLoadCharts])

    return <div ref={chartRef}>{shouldLoadCharts ? <DashboardPreviewCharts /> : <DashboardChartsSkeleton />}</div>
}
