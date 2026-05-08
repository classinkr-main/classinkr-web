"use client"

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

export function DashboardPreviewCharts() {
    return (
        <div className="grid gap-5 md:grid-cols-2">
            <div
                className="rounded-2xl border border-white/10 p-6"
                style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}
            >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/25">Engagement</div>
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

            <div
                className="rounded-2xl border border-white/10 p-6"
                style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}
            >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/25">Performance</div>
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
    )
}
