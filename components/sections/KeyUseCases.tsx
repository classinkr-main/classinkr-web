"use client"

import Image from "next/image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Check } from "lucide-react"
import { motion } from "framer-motion"

type UseCaseTab = "classes" | "homework" | "admin" | "comms"

export function KeyUseCases({ defaultValue = "classes" }: { defaultValue?: UseCaseTab } = {}) {
    return (
        <section id="use-cases" className="py-16 md:py-24 bg-[#F6F5F4]">
            <div className="container mx-auto">
                <div className="text-center max-w-3xl mx-auto mb-16 px-4">
                    <h2 className="text-4xl md:text-5xl font-black text-[#111110] mb-6 break-keep" style={{ letterSpacing: '-1.5px' }}>
                        모든 구성원을 위한 맞춤 설계
                    </h2>
                    <p className="text-xl text-[#A39E98] font-medium break-keep">
                        강사, 관리자, 학생 모두에게 최적화된 경험을 제공합니다.
                    </p>
                </div>

                <Tabs defaultValue={defaultValue} className="w-full max-w-6xl mx-auto">
                    <div className="flex justify-center mb-12 px-4">
                        <TabsList className="grid w-full max-w-3xl grid-cols-2 sm:grid-cols-2 md:grid-cols-4 h-auto p-1.5 bg-[rgba(0,0,0,0.06)] rounded-2xl gap-1">
                            <TabsTrigger value="classes" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#111110] text-[#A39E98] transition-all">인터랙티브 수업</TabsTrigger>
                            <TabsTrigger value="homework" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#111110] text-[#A39E98] transition-all">과제 및 테스트</TabsTrigger>
                            <TabsTrigger value="admin" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#111110] text-[#A39E98] transition-all">관리자 대시보드</TabsTrigger>
                            <TabsTrigger value="comms" className="py-3 text-base md:text-lg font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#111110] text-[#A39E98] transition-all">소통 및 알림</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="mt-8">
                        <TabsContent value="classes">
                            <UseCaseCard
                                title="참여형 하이브리드 수업 진행"
                                desc="온오프라인 학생들을 동시에 참여시키는 동기화된 수업 도구."
                                points={[
                                    "실시간 상호작용 화면 공유",
                                    "30여가지의 수업 도구",
                                    "자동 출석 체크",
                                    "수업 자동 녹화 및 자동 업로드",
                                ]}
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/classes-source.png"
                                imageAlt="Classin 활동 게시하기 화면"
                                imageObjectPosition="50% 50%"
                            />
                        </TabsContent>
                        <TabsContent value="homework">
                            <UseCaseCard
                                title="과제 및 채점 자동화"
                                desc="과제 배포와 채점을 자동화하여 강사의 업무 시간을 획기적으로 줄이세요."
                                points={[
                                    "템플릿 화 및 예약 기능",
                                    "즉석 첨삭 가능 및 자동 저장",
                                    "학생 즉각 피드백",
                                ]}
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/homework-source.png"
                                imageAlt="Classin 숙제 채점 데이터 화면"
                                imageObjectPosition="52% 45%"
                            />
                        </TabsContent>
                        <TabsContent value="admin">
                            <UseCaseCard
                                title="관리자를 위한 360° 뷰"
                                desc="모든 지점, 반, 학생의 데이터를 세밀하게 파악하여 학원 운영 현황을 모니터링하세요."
                                points={[
                                    "수업 내용 및 정보 추적",
                                    "수업 및 출결 현황",
                                    "수업 및 숙제 관리, 일괄 생성",
                                ]}
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/admin-dashboard-source-1.png"
                                imageAlt="관리자 출결 대시보드 화면"
                                imageObjectPosition="48% 42%"
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
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/comms-source.png"
                                imageAlt="Classin 반 운영 및 알림 화면"
                                imageObjectPosition="86% 50%"
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </section>
    )
}

function UseCaseCard({
    title,
    desc,
    points,
    imageColor,
    imageSrc,
    imageAlt,
    imageObjectPosition = "50% 50%",
}: {
    title: string
    desc: string
    points: string[]
    imageColor: string
    imageSrc?: string
    imageAlt?: string
    imageObjectPosition?: string
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
        >
            <Card className="overflow-hidden border border-[rgba(0,0,0,0.08)] bg-white rounded-[2rem]" style={{ boxShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px' }}>
                <div className="grid gap-0 md:grid-cols-[1.12fr_0.88fr]">
                    <div className={`h-[22rem] md:h-auto ${imageColor} flex items-center justify-center p-4 md:p-6 lg:p-7 relative overflow-hidden`}>
                        {imageSrc && (
                            <div className="relative z-20 w-[108%] max-w-none">
                                <div className="relative aspect-[16/10] overflow-hidden">
                                    <Image
                                        src={imageSrc}
                                        alt={imageAlt || title}
                                        fill
                                        sizes="(min-width: 1024px) 42vw, (min-width: 768px) 50vw, 92vw"
                                        className="object-cover"
                                        style={{ objectPosition: imageObjectPosition }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-8 md:p-14 flex flex-col justify-center bg-white">
                        <h3 className="text-3xl font-extrabold mb-5 text-[#111110] leading-tight break-keep" style={{ letterSpacing: '-1px' }}>{title}</h3>
                        <p className="text-[#A39E98] mb-8 text-lg leading-relaxed font-medium break-keep">
                            {desc}
                        </p>
                        <ul className="space-y-4">
                            {points.map((point, i) => (
                                <li key={i} className="flex items-center gap-4 group">
                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[#084734]">
                                        <Check className="w-5 h-5" strokeWidth={3} />
                                    </div>
                                    <span className="text-[#615D59] font-bold text-lg break-keep">{point}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}
