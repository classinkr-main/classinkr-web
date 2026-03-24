"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Check } from "lucide-react"
import { motion } from "framer-motion"

export function KeyUseCases() {
    return (
        <section id="use-cases" className="py-16 md:py-24 bg-slate-50">
            <div className="container mx-auto">
                <div className="text-center max-w-3xl mx-auto mb-16 px-4">
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-6 break-keep">
                        모든 구성원을 위한 맞춤 설계
                    </h2>
                    <p className="text-xl text-slate-500 font-medium break-keep">
                        강사, 관리자, 학생 모두에게 최적화된 경험을 제공합니다.
                    </p>
                </div>

                <Tabs defaultValue="classes" className="w-full max-w-5xl mx-auto">
                    <div className="flex justify-center mb-12 px-4">
                        <TabsList className="grid w-full max-w-3xl grid-cols-2 md:grid-cols-4 h-auto p-1.5 bg-slate-200/50 rounded-2xl gap-1">
                            <TabsTrigger value="classes" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 transition-all">인터랙티브 수업</TabsTrigger>
                            <TabsTrigger value="homework" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 transition-all">과제 및 테스트</TabsTrigger>
                            <TabsTrigger value="admin" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 transition-all">관리자 대시보드</TabsTrigger>
                            <TabsTrigger value="comms" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 transition-all">소통 및 알림</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="mt-8">
                        <TabsContent value="classes">
                            <UseCaseCard
                                title="참여형 하이브리드 수업 진행"
                                desc="온오프라인 학생들을 동시에 참여시키는 동기화된 수업 도구."
                                points={[
                                    "실시간 화이트보드 공유",
                                    "수업 중 퀴즈 및 투표",
                                    "자동 출석 체크",
                                ]}
                                imageColor="bg-green-100"
                                imageSrc="/images/use-cases/interactive.png"
                                imageAlt="Interactive 3D Elements"
                            />
                        </TabsContent>
                        <TabsContent value="homework">
                            <UseCaseCard
                                title="과제 및 채점 자동화"
                                desc="과제 배포와 채점을 자동화하여 강사의 업무 시간을 획기적으로 줄이세요."
                                points={[
                                    "5만 개 이상의 표준화된 문제 은행",
                                    "서술형 AI 자동 채점",
                                    "학생 즉각 피드백",
                                ]}
                                imageColor="bg-blue-100"
                                imageSrc="/images/use-cases/homework.png"
                                imageAlt="Homework 3D Elements"
                            />
                        </TabsContent>
                        <TabsContent value="admin">
                            <UseCaseCard
                                title="관리자를 위한 360° 뷰"
                                desc="모든 지점, 반, 학생의 데이터를 세밀하게 파악하여 학원 운영 현황을 모니터링하세요."
                                points={[
                                    "매출 및 등록 현황 추적",
                                    "강사 성과 분석",
                                    "이탈 위험 학생 알림",
                                ]}
                                imageColor="bg-purple-100"
                                imageSrc="/images/use-cases/admin.png"
                                imageAlt="Admin 3D Elements"
                            />
                        </TabsContent>
                        <TabsContent value="comms">
                            <UseCaseCard
                                title="매끄러운 학부모 소통"
                                desc="매일 문자를 작성하는 수고 없이 학부모에게 학습 현황을 공유하세요."
                                points={[
                                    "주간 학습 리포트 자동 발송",
                                    "실시간 소통 채널",
                                    "일정 및 결제 알림",
                                ]}
                                imageColor="bg-orange-100"
                                imageSrc="/images/use-cases/comms.png"
                                imageAlt="Communication 3D Elements"
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </section>
    )
}

function UseCaseCard({ title, desc, points, imageColor, imageSrc, imageAlt }: { title: string, desc: string, points: string[], imageColor: string, imageSrc?: string, imageAlt?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
        >
            <Card className="overflow-hidden border border-slate-200/60 shadow-xl bg-white rounded-[2rem]">
                <div className="grid md:grid-cols-2 gap-0">
                    <div className={`h-72 md:h-auto ${imageColor} flex items-center justify-center p-8 md:p-12 relative overflow-hidden`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent z-0" />
                        
                        {imageSrc && (
                            <motion.img 
                                src={imageSrc} 
                                alt={imageAlt || title}
                                className="absolute -bottom-8 -right-8 w-64 md:w-80 h-auto z-20 drop-shadow-2xl"
                                animate={{ y: [0, -12, 0] }}
                                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                            />
                        )}

                        {/* Mock UI Element */}
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            transition={{ type: "spring", bounce: 0.4 }}
                            className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-6 space-y-4 z-10 border border-white/50 relative"
                        >
                            <div className="h-3 w-1/3 bg-slate-200/80 rounded-full" />
                            <div className="h-3 w-2/3 bg-slate-200/80 rounded-full" />
                            <div className="h-40 bg-slate-100/80 rounded-xl mt-6 border border-slate-50" />
                        </motion.div>
                    </div>
                    <div className="p-8 md:p-14 flex flex-col justify-center bg-white">
                        <h3 className="text-3xl font-extrabold mb-5 text-slate-900 tracking-tight leading-tight break-keep">{title}</h3>
                        <p className="text-slate-500 mb-8 text-lg leading-relaxed font-medium break-keep">
                            {desc}
                        </p>
                        <ul className="space-y-4">
                            {points.map((point, i) => (
                                <li key={i} className="flex items-center gap-4 group">
                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-emerald-50 group-hover:bg-emerald-500 flex items-center justify-center text-emerald-600 group-hover:text-white transition-colors duration-300">
                                        <Check className="w-5 h-5" strokeWidth={3} />
                                    </div>
                                    <span className="text-slate-700 font-bold text-lg group-hover:text-slate-900 transition-colors break-keep">{point}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}
