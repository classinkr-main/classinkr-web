"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Quote } from "lucide-react"

export function CaseStudies() {
    return (
        <section className="py-16 md:py-24 bg-slate-50">
            <div className="container mx-auto">
                <h2 className="text-3xl font-extrabold tracking-tight text-center text-slate-900 sm:text-4xl mb-16 break-keep">
                    성공적인 도입 사례
                </h2>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {/* Case 1 */}
                    <Card className="border-none shadow-lg">
                        <CardContent className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">대치</div>
                                <div>
                                    <div className="font-bold text-slate-900">대치 시그니처 수학</div>
                                    <div className="text-xs text-muted-foreground">강남 본원 외 4개 직영점, 원생 2,000명+</div>
                                </div>
                            </div>
                            <div className="mb-6 space-y-2">
                                <div className="text-sm font-semibold text-slate-500 uppercase">도전 과제 (Challenge)</div>
                                <p className="text-slate-700 text-sm break-keep">지점별로 천차만별인 강사 역량과 주먹구구식 평가 시스템.</p>
                            </div>
                            <div className="mb-6 space-y-2">
                                <div className="text-sm font-semibold text-[#084734] uppercase">결과 (Result)</div>
                                <p className="text-slate-900 font-medium break-keep">도입 2주 만에 전 지점 평가 방식 100% 통합 및 행정 리소스 60% 절감.</p>
                            </div>
                            <blockquote className="bg-slate-50 p-4 rounded-lg italic text-slate-600 text-sm relative break-keep">
                                <Quote className="w-4 h-4 text-slate-300 absolute -top-2 -left-2 fill-current" />
                                &quot;행정 직원을 추가 채용하지 않고도 2개 지점을 더 오픈했습니다. 학부모님들은 어느 지점을 가든 최고 퀄리티의 통합 데이터 리포트를 받아보며 만족하십니다.&quot;
                                <div className="mt-3 text-right font-bold text-slate-400 not-italic text-xs break-keep">- 김민준 대표원장</div>
                            </blockquote>
                        </CardContent>
                    </Card>

                    {/* Case 2 */}
                    <Card className="border-none shadow-lg">
                        <CardContent className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">하이</div>
                                <div>
                                    <div className="font-bold text-slate-900">하이엔드 영재어학원</div>
                                    <div className="text-xs text-muted-foreground">초·중등 프리미엄 관, 원생 800명+</div>
                                </div>
                            </div>
                            <div className="mb-6 space-y-2">
                                <div className="text-sm font-semibold text-slate-500 uppercase">도전 과제 (Challenge)</div>
                                <p className="text-slate-700 text-sm break-keep">대형식 강의 위주 수업으로 인한 개별 학생 수업 몰입도 하락.</p>
                            </div>
                            <div className="mb-6 space-y-2">
                                <div className="text-sm font-semibold text-[#084734] uppercase">결과 (Result)</div>
                                <p className="text-slate-900 font-medium break-keep">과제 완수율 65%에서 92%로 급상승, 퇴원율 3배 감소.</p>
                            </div>
                            <blockquote className="bg-slate-50 p-4 rounded-lg italic text-slate-600 text-sm relative break-keep">
                                <Quote className="w-4 h-4 text-slate-300 absolute -top-2 -left-2 fill-current" />
                                &quot;인터랙티브 화이트보드와 AI 자동 채점 덕분에 수십 명이 듣는 대형 강의실에서도 학생 한 명 한 명을 1:1 과외처럼 밀착 관리할 수 있게 되었습니다.&quot;
                                <div className="mt-3 text-right font-bold text-slate-400 not-italic text-xs break-keep">- 이서윤 원장</div>
                            </blockquote>
                        </CardContent>
                    </Card>

                    {/* Case 3 */}
                    <Card className="border-none shadow-lg md:col-span-2 lg:col-span-1">
                        <CardContent className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">이데</div>
                                <div>
                                    <div className="font-bold text-slate-900">이데아 수능 전문학원</div>
                                    <div className="text-xs text-muted-foreground">전국 프랜차이즈, 15개 가맹점</div>
                                </div>
                            </div>
                            <div className="mb-6 space-y-2">
                                <div className="text-sm font-semibold text-slate-500 uppercase">도전 과제 (Challenge)</div>
                                <p className="text-slate-700 text-sm break-keep">에이스 강사에 대한 의존도가 높아 강사 퇴사 시 원생 대규모 이탈 리스크 상존.</p>
                            </div>
                            <div className="mb-6 space-y-2">
                                <div className="text-sm font-semibold text-[#084734] uppercase">결과 (Result)</div>
                                <p className="text-slate-900 font-medium break-keep">학원 고유 시스템 구축 성공, 신입 강사 적응 기간 3개월 → 2주로 단축.</p>
                            </div>
                            <blockquote className="bg-slate-50 p-4 rounded-lg italic text-slate-600 text-sm relative break-keep">
                                <Quote className="w-4 h-4 text-slate-300 absolute -top-2 -left-2 fill-current" />
                                &quot;이제 특정 강사의 개인기에 의존하지 않습니다. 철저한 데이터 공개로 신뢰를 얻었고, 본사는 확실한 운영 및 교육 퀄리티 통제력을 회복했습니다.&quot;
                                <div className="mt-3 text-right font-bold text-slate-400 not-italic text-xs break-keep">- 박정호 대표</div>
                            </blockquote>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    )
}
