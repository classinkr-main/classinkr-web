
"use client"

import { ArrowUpRight, TrendingUp, Users, BookOpen } from "lucide-react"
import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
    Area,
    AreaChart,
} from "recharts"

const engagementData = [
    { week: "W1", score: 65, avg: 60 },
    { week: "W2", score: 68, avg: 62 },
    { week: "W3", score: 75, avg: 65 },
    { week: "W4", score: 72, avg: 66 },
    { week: "W5", score: 82, avg: 68 },
    { week: "W6", score: 85, avg: 70 },
    { week: "W7", score: 88, avg: 72 },
    { week: "W8", score: 92, avg: 75 },
]

const homeworkData = [
    { class: "Class A", completed: 85, score: 78 },
    { class: "Class B", completed: 92, score: 88 },
    { class: "Class C", completed: 65, score: 72 },
    { class: "Class D", completed: 78, score: 81 },
]

const kpis = [
    { label: "출석률", value: "98.2%", delta: "+2.1%", icon: <Users className="w-4 h-4" /> },
    { label: "평균 점수", value: "84.5", delta: "+5.4%", icon: <BookOpen className="w-4 h-4" /> },
    { label: "참여도", value: "92", delta: "+12pt", icon: <TrendingUp className="w-4 h-4" /> },
]

export function DashboardPreview() {
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
                        <span className="mb-3 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-widest text-white/50 uppercase">
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
                                <div className="mt-1 flex items-center gap-0.5 text-emerald-400 text-xs font-medium">
                                    <ArrowUpRight className="w-3 h-3" />
                                    {kpi.delta}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 차트 그리드 */}
                <div className="grid gap-5 md:grid-cols-2">
                    {/* Chart 1: Area + Line */}
                    <div
                        className="rounded-2xl border border-white/10 p-6"
                        style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}
                    >
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/30">Engagement</div>
                        <div className="mb-5 flex items-end justify-between">
                            <p className="text-base font-semibold text-white">수업 참여도 추이</p>
                            <div className="flex items-center gap-3 text-[11px]">
                                <span className="flex items-center gap-1.5 text-white/40">
                                    <span className="inline-block h-0.5 w-4 rounded bg-white/25 border-dashed" />
                                    지역 평균
                                </span>
                                <span className="flex items-center gap-1.5 text-[#6EE7B7]">
                                    <span className="inline-block h-0.5 w-4 rounded" style={{ background: "linear-gradient(90deg,#084734,#6EE7B7)" }} />
                                    우리 학원
                                </span>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={engagementData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradScore" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#084734" />
                                        <stop offset="100%" stopColor="#6EE7B7" />
                                    </linearGradient>
                                    <linearGradient id="gradScoreFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#084734" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#6EE7B7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                                <XAxis
                                    dataKey="week"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }}
                                    dy={8}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }}
                                    domain={[50, 100]}
                                />
                                <RechartsTooltip
                                    contentStyle={{
                                        backgroundColor: "rgba(15,12,41,0.9)",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        borderRadius: "10px",
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                        backdropFilter: "blur(12px)",
                                    }}
                                    labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}
                                    itemStyle={{ color: "#fff", fontSize: 12 }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="avg"
                                    name="지역 평균"
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 4"
                                    fill="transparent"
                                    dot={false}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="score"
                                    name="우리 학원"
                                    stroke="url(#gradScore)"
                                    strokeWidth={2.5}
                                    fill="url(#gradScoreFill)"
                                    dot={false}
                                    activeDot={{ r: 5, fill: "#084734", strokeWidth: 0 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Chart 2: Bar */}
                    <div
                        className="rounded-2xl border border-white/10 p-6"
                        style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}
                    >
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/30">Performance</div>
                        <div className="mb-5 flex items-end justify-between">
                            <p className="text-base font-semibold text-white">과제 완료율 vs 성적</p>
                            <div className="flex items-center gap-3 text-[11px]">
                                <span className="flex items-center gap-1.5 text-white/40">
                                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white/20" />
                                    평균 점수
                                </span>
                                <span className="flex items-center gap-1.5 text-[#6EE7B7]">
                                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "linear-gradient(180deg,#6EE7B7,#084734)" }} />
                                    완료율 %
                                </span>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={homeworkData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }} barGap={4}>
                                <defs>
                                    <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#6EE7B7" />
                                        <stop offset="100%" stopColor="#084734" />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                                <XAxis
                                    dataKey="class"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }}
                                    dy={8}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }}
                                    domain={[0, 100]}
                                />
                                <RechartsTooltip
                                    contentStyle={{
                                        backgroundColor: "rgba(15,12,41,0.9)",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        borderRadius: "10px",
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                        backdropFilter: "blur(12px)",
                                    }}
                                    labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}
                                    itemStyle={{ color: "#fff", fontSize: 12 }}
                                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                />
                                <Bar dataKey="score" name="평균 점수" fill="rgba(255,255,255,0.12)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                <Bar dataKey="completed" name="완료율 %" fill="url(#gradBar)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
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
