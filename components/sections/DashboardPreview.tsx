
"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, TrendingUp, Users, BookOpen } from "lucide-react"

const DashboardPreviewCharts = dynamic(
    () => import("./DashboardPreviewCharts").then((mod) => mod.DashboardPreviewCharts),
    {
        ssr: false,
        loading: () => <DashboardChartsSkeleton />,
    }
)

const kpis = [
    { label: "출석률", value: "98.2%", delta: "+2.1%", icon: <Users className="w-4 h-4" /> },
    { label: "평균 점수", value: "84.5", delta: "+5.4%", icon: <BookOpen className="w-4 h-4" /> },
    { label: "참여도", value: "92", delta: "+12pt", icon: <TrendingUp className="w-4 h-4" /> },
]

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

export function DashboardPreview() {
    const chartRef = useRef<HTMLDivElement | null>(null)
    const [shouldLoadCharts, setShouldLoadCharts] = useState(false)

    useEffect(() => {
        if (shouldLoadCharts) return

        const target = chartRef.current
        let idleHandle: number | undefined
        let timeoutHandle: number | undefined

        const scheduleChartLoad = () => {
            const idleWindow = window as Window & {
                requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
                cancelIdleCallback?: (handle: number) => void
            }

            if (idleWindow.requestIdleCallback) {
                idleHandle = idleWindow.requestIdleCallback(() => setShouldLoadCharts(true), { timeout: 1200 })
            } else {
                timeoutHandle = window.setTimeout(() => setShouldLoadCharts(true), 300)
            }
        }

        if (!target || !("IntersectionObserver" in window)) {
            scheduleChartLoad()
            return () => {
                if (idleHandle !== undefined) {
                    const idleWindow = window as Window & { cancelIdleCallback?: (handle: number) => void }
                    idleWindow.cancelIdleCallback?.(idleHandle)
                }
                if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
            }
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return
                scheduleChartLoad()
                observer.disconnect()
            },
            { rootMargin: "120px" }
        )

        observer.observe(target)
        return () => {
            observer.disconnect()
            if (idleHandle !== undefined) {
                const idleWindow = window as Window & { cancelIdleCallback?: (handle: number) => void }
                idleWindow.cancelIdleCallback?.(idleHandle)
            }
            if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
        }
    }, [shouldLoadCharts])

    return (
        <section
            id="dashboard"
            className="relative overflow-hidden py-20 md:py-32"
            style={{
                background: "linear-gradient(135deg, #031a12 0%, #052e1e 50%, #084734 100%)",
            }}
        >
            {/* 배경 장식 오브 */}
            <div className="pointer-events-none absolute inset-0">
                <div
                    className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full opacity-20"
                    style={{ background: "radial-gradient(circle, #084734 0%, transparent 70%)" }}
                />
                <div
                    className="absolute -bottom-40 -right-20 h-[600px] w-[600px] rounded-full opacity-15"
                    style={{ background: "radial-gradient(circle, #065c41 0%, transparent 70%)" }}
                />
                <div
                    className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10"
                    style={{ background: "radial-gradient(circle, #6EE7B7 0%, transparent 70%)" }}
                />
            </div>

            <div className="container relative mx-auto px-4">
                {/* 헤더 */}
                <div className="mb-14 flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
                    <div className="max-w-xl">
                        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-1.5 text-[11px] font-semibold tracking-[0.25em] text-white/40 uppercase shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
                            <span className="w-1 h-1 rounded-full bg-[#6EE7B7]/60" />
                            Analytics
                        </span>
                        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl break-keep leading-tight">
                            데이터 기반 의사결정,<br />즉시 확인하세요
                        </h2>
                        <p className="mt-4 text-base text-white/50 break-keep leading-relaxed">
                            추측은 그만. 실시간 분석으로 반, 강사, 학생의 성과를 파악하세요.
                        </p>
                    </div>

                    {/* KPI 카드 */}
                    <div className="flex gap-3">
                        {kpis.map((kpi) => (
                            <div
                                key={kpi.label}
                                className="rounded-2xl border border-white/10 px-4 py-4 w-24 sm:w-28 md:w-32"
                                style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px)" }}
                            >
                                <div className="mb-2 flex items-center gap-1.5 text-white/40">
                                    {kpi.icon}
                                    <span className="text-[10px] font-medium uppercase tracking-wider">{kpi.label}</span>
                                </div>
                                <div className="text-2xl font-bold text-white">{kpi.value}</div>
                                <div className="mt-1 flex items-center gap-0.5 text-[#6EE7B7] text-xs font-medium">
                                    <ArrowUpRight className="w-3 h-3" />
                                    {kpi.delta}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 차트 그리드 */}
                <div ref={chartRef}>
                    {shouldLoadCharts ? <DashboardPreviewCharts /> : <DashboardChartsSkeleton />}
                </div>

                {/* 하단 미니 지표 스트립 */}
                <div
                    className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 px-2 py-4"
                    style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}
                >
                    {[
                        { label: "이번 주 수업", value: "142건", sub: "전주 대비 +8건" },
                        { label: "미제출 과제 알림", value: "3명", sub: "자동 알림 발송 완료" },
                        { label: "학부모 열람율", value: "76%", sub: "리포트 발송 후 24h 기준" },
                    ].map((item) => (
                        <div key={item.label} className="px-6 text-center">
                            <div className="text-[11px] text-white/30 mb-1">{item.label}</div>
                            <div className="text-xl font-bold text-white">{item.value}</div>
                            <div className="text-[11px] text-white/25 mt-0.5">{item.sub}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
