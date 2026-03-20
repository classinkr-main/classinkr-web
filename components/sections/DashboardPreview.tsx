
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, BarChart, Bar, Legend } from "recharts"
import { ArrowUpRight } from "lucide-react"

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

export function DashboardPreview() {
    return (
        <section id="dashboard" className="py-24 bg-white">
            <div className="container mx-auto">
                <div className="mb-12 flex flex-col md:flex-row items-end justify-between gap-6">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl mb-4">
                            데이터 기반 의사결정, 즉시 확인하세요
                        </h2>
                        <p className="text-lg text-muted-foreground">
                            추측은 그만. 실시간 분석으로 반, 강사, 학생의 성과를 정확히 파악하세요.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        {/* Simple KPI Cards */}
                        <div className="bg-slate-50 border rounded-lg p-4 w-32">
                            <div className="text-muted-foreground text-xs font-medium uppercase">출석률</div>
                            <div className="text-2xl font-bold text-slate-900 mt-1">98.2%</div>
                            <div className="text-green-600 text-xs flex items-center mt-1">
                                <ArrowUpRight className="w-3 h-3 mr-1" /> +2.1%
                            </div>
                        </div>
                        <div className="bg-slate-50 border rounded-lg p-4 w-32">
                            <div className="text-muted-foreground text-xs font-medium uppercase">평균 점수</div>
                            <div className="text-2xl font-bold text-slate-900 mt-1">84.5</div>
                            <div className="text-green-600 text-xs flex items-center mt-1">
                                <ArrowUpRight className="w-3 h-3 mr-1" /> +5.4%
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Chart 1: Engagement */}
                    <Card className="shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold text-slate-800">수업 참여도 추이</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={engagementData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            itemStyle={{ color: '#1e293b', fontSize: '13px' }}
                                        />
                                        <Legend />
                                        <Line type="monotone" dataKey="score" name="우리 학원" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                        <Line type="monotone" dataKey="avg" name="지역 평균" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Chart 2: Homework Analysis */}
                    <Card className="shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold text-slate-800">과제 완료율 vs 성적</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={homeworkData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="class" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            cursor={{ fill: '#f1f5f9' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="completed" name="완료율 %" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="score" name="평균 점수" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    )
}
