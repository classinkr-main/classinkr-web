"use client"

import Image from "next/image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Check } from "lucide-react"
import { motion } from "framer-motion"

export function KeyUseCases() {
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

                <Tabs defaultValue="classes" className="w-full max-w-6xl mx-auto">
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
                                    "실시간 화이트보드 공유",
                                    "수업 중 퀴즈 및 투표",
                                    "자동 출석 체크",
                                ]}
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/classes-source.png"
                                imageAlt="ClassIn 활동 게시하기 화면"
                                imageObjectPosition="50% 50%"
                                overlayImageSrc="/images/use-cases/generated/interactive-generated-v3.png"
                                overlayImageAlt="인터랙티브 수업 투명 오브젝트"
                                overlayImageClassName="w-[36%] min-w-[7.5rem] right-[-1%] bottom-[-6%] md:w-[42%] md:right-[-2%] md:bottom-[-9%]"
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
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/homework-source.png"
                                imageAlt="ClassIn 숙제 채점 데이터 화면"
                                imageObjectPosition="52% 45%"
                                overlayImageSrc="/images/use-cases/generated/homework-generated-v3.png"
                                overlayImageAlt="과제 및 테스트 투명 오브젝트"
                                overlayImageClassName="w-[38%] min-w-[7.5rem] right-[-2%] bottom-[-7%] md:w-[44%] md:right-[-3%] md:bottom-[-10%]"
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
                                imageColor="bg-[#ECFDF5]"
                                imageSrc="/images/use-cases/generated/admin-dashboard-source-1.png"
                                imageAlt="관리자 출결 대시보드 화면"
                                imageObjectPosition="48% 42%"
                                overlayImageSrc="/images/use-cases/generated/admin-dashboard-source-2.png"
                                overlayImageAlt="관리자 상세 분석 화면"
                                overlayImageClassName="w-[40%] min-w-[8rem] right-[-2%] top-[4%] md:w-[42%] md:right-[-2%] md:top-[2%] rotate-[4deg]"
                                overlayImageObjectPosition="50% 50%"
                                overlayImageFramed
                                secondaryOverlayImageSrc="/images/use-cases/admin.png"
                                secondaryOverlayImageAlt="관리 테마 보조 오브젝트"
                                secondaryOverlayImageClassName="w-[28%] min-w-[6rem] right-[2%] bottom-[-2%] md:w-[30%] md:right-[1%] md:bottom-[-5%]"
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
                                imageAlt="ClassIn 반 운영 및 알림 화면"
                                imageObjectPosition="86% 50%"
                                overlayImageSrc="/images/use-cases/comms.png"
                                overlayImageAlt="소통 및 알림 투명 오브젝트"
                                overlayImageClassName="w-[32%] min-w-[7rem] right-[2%] bottom-[-4%] md:w-[37%] md:right-[1%] md:bottom-[-7%]"
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
    overlayImageSrc,
    overlayImageAlt,
    overlayImageObjectPosition = "50% 50%",
    overlayImageClassName = "",
    overlayImageFramed = false,
    secondaryOverlayImageSrc,
    secondaryOverlayImageAlt,
    secondaryOverlayImageObjectPosition = "50% 50%",
    secondaryOverlayImageClassName = "",
    secondaryOverlayImageFramed = false,
}: {
    title: string
    desc: string
    points: string[]
    imageColor: string
    imageSrc?: string
    imageAlt?: string
    imageObjectPosition?: string
    overlayImageSrc?: string
    overlayImageAlt?: string
    overlayImageObjectPosition?: string
    overlayImageClassName?: string
    overlayImageFramed?: boolean
    secondaryOverlayImageSrc?: string
    secondaryOverlayImageAlt?: string
    secondaryOverlayImageObjectPosition?: string
    secondaryOverlayImageClassName?: string
    secondaryOverlayImageFramed?: boolean
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
                        <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-white/8 to-transparent z-0" />
                        <div className="absolute left-8 top-8 h-24 w-24 rounded-full bg-white/45 blur-3xl z-0" />
                        <div className="absolute right-10 bottom-10 h-28 w-28 rounded-full bg-[#CFEFE1]/75 blur-3xl z-0" />

                        {imageSrc && (
                            <motion.div
                                whileHover={{ y: -4, rotate: -1 }}
                                transition={{ type: "spring", bounce: 0.3 }}
                                className="relative z-20 w-[108%] max-w-none"
                            >
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
                            </motion.div>
                        )}

                        {overlayImageSrc && (
                            <motion.div
                                whileHover={{ y: -6, rotate: 1 }}
                                transition={{ type: "spring", bounce: 0.28 }}
                                className={`absolute z-30 ${overlayImageClassName}`}
                            >
                                {overlayImageFramed ? (
                                    <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] border border-[rgba(17,17,16,0.08)] bg-white shadow-[0_22px_44px_rgba(17,17,16,0.14)]">
                                        <Image
                                            src={overlayImageSrc}
                                            alt={overlayImageAlt || title}
                                            fill
                                            sizes="(min-width: 1024px) 18vw, 32vw"
                                            className="object-cover"
                                            style={{ objectPosition: overlayImageObjectPosition }}
                                        />
                                    </div>
                                ) : (
                                    <div className="relative aspect-square">
                                        <Image
                                            src={overlayImageSrc}
                                            alt={overlayImageAlt || title}
                                            fill
                                            sizes="(min-width: 1024px) 15vw, 28vw"
                                            className="object-contain drop-shadow-[0_14px_18px_rgba(8,71,52,0.14)]"
                                            style={{ objectPosition: overlayImageObjectPosition }}
                                        />
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {secondaryOverlayImageSrc && (
                            <motion.div
                                whileHover={{ y: -5, rotate: -1 }}
                                transition={{ type: "spring", bounce: 0.26 }}
                                className={`absolute z-20 ${secondaryOverlayImageClassName}`}
                            >
                                {secondaryOverlayImageFramed ? (
                                    <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] border border-[rgba(17,17,16,0.08)] bg-white shadow-[0_22px_44px_rgba(17,17,16,0.14)]">
                                        <Image
                                            src={secondaryOverlayImageSrc}
                                            alt={secondaryOverlayImageAlt || title}
                                            fill
                                            sizes="(min-width: 1024px) 16vw, 24vw"
                                            className="object-cover"
                                            style={{ objectPosition: secondaryOverlayImageObjectPosition }}
                                        />
                                    </div>
                                ) : (
                                    <div className="relative aspect-square">
                                        <Image
                                            src={secondaryOverlayImageSrc}
                                            alt={secondaryOverlayImageAlt || title}
                                            fill
                                            sizes="(min-width: 1024px) 12vw, 22vw"
                                            className="object-contain drop-shadow-[0_14px_18px_rgba(8,71,52,0.12)]"
                                            style={{ objectPosition: secondaryOverlayImageObjectPosition }}
                                        />
                                    </div>
                                )}
                            </motion.div>
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
                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#ECFDF5] group-hover:bg-[#084734] flex items-center justify-center text-[#084734] group-hover:text-white transition-colors duration-300">
                                        <Check className="w-5 h-5" strokeWidth={3} />
                                    </div>
                                    <span className="text-[#615D59] font-bold text-lg group-hover:text-[#111110] transition-colors break-keep">{point}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}
