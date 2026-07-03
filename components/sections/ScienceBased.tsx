import { Clock, Users } from "lucide-react"
import Image from "next/image"

import { Reveal } from "@/components/motion/Reveal"

export function ScienceBased() {
    return (
        <section className="py-16 md:py-24 bg-[#111110] overflow-hidden relative">
            {/* Background Texture */}
            <div className="absolute inset-0 bg-[url('/images/noise-texture.svg')] opacity-10 mix-blend-overlay pointer-events-none" />
            <div className="absolute top-1/4 left-0 w-96 h-96 bg-[#084734]/20 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-[#084734]/15 blur-[100px] rounded-full pointer-events-none" />

            <div className="container mx-auto px-6 max-w-6xl relative z-10">
                <Reveal
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-24"
                >
                    <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 font-sans break-keep" style={{ letterSpacing: '-1.5px' }}>
                        교육적 이론에 최적화된 <br className="md:hidden" />
                        학습 솔루션
                    </h2>
                    <p className="text-xl text-[#A39E98] font-medium break-keep">
                        단순히 편리한 도구가 아닙니다. 학습 효율을 극대화하는 검증된 교육 공학입니다.
                    </p>
                </Reveal>

                <div className="space-y-20 md:space-y-32">
                    {/* Ebbinghaus Section */}
                    <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-16 lg:gap-24">
                        <Reveal
                            initial={{ opacity: 0, y: 100 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.8, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 relative"
                        >
                            <div className="relative w-full h-72 md:h-[40rem] mx-auto overflow-hidden flex items-end justify-center">
                                <Image
                                    src="/images/ebbinghaus.png"
                                    alt="Hermann Ebbinghaus"
                                    fill
                                    className="object-contain object-bottom scale-100 md:scale-110"
                                />
                                <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-[#111110] via-[#111110]/60 to-transparent z-0" />

                                <Reveal
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.8, delay: 0.3 }}
                                    className="absolute bottom-6 left-6 z-10"
                                >
                                    <div className="font-extrabold text-2xl md:text-3xl text-white drop-shadow-xl">Hermann Ebbinghaus</div>
                                    <div className="text-[12px] font-bold text-[#6EE7B7]/80 tracking-[0.3em] mt-1.5 uppercase drop-shadow-md">Memory & Psychology</div>
                                </Reveal>
                            </div>
                        </Reveal>

                        <Reveal
                            initial={{ opacity: 0, x: 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 space-y-8"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-[#ECFDF5]/10 flex items-center justify-center text-[#6EE7B7] ring-1 ring-[#6EE7B7]/30">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <h3 className="text-3xl font-bold text-white" style={{ letterSpacing: '-1px' }}>에빙하우스의 망각 곡선</h3>
                            </div>

                            <blockquote className="border-l-4 border-[#6EE7B7]/40 pl-6 py-2 text-xl text-white/70 italic font-medium leading-relaxed bg-gradient-to-r from-[#084734]/10 to-transparent break-keep">
                                &ldquo;학습 후 20분이 지나면 기억의 42%가 사라지고, 하루가 지나면 67%를 잊어버린다.&rdquo;
                            </blockquote>

                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-white break-keep">
                                    Classin의 솔루션: <span className="text-[#6EE7B7]">골든타임 복습</span>
                                </h4>
                                <p className="text-[#A39E98] leading-relaxed text-lg break-keep">
                                    우리는 학습 직후 가장 중요한 &apos;골든타임&apos;을 놓치지 않습니다. 수업 종료 즉시 AI가 생성한 핵심 요약 퀴즈가 학생의 스마트폰으로 전송됩니다. 망각이 시작되기 전에 기억을 장기 저장소로 옮기는 연결 고리를 만듭니다.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#즉시복습</span>
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#장기기억</span>
                            </div>
                        </Reveal>
                    </div>

                    {/* Scott Freeman Section */}
                    <div className="flex flex-col lg:flex-row-reverse items-center gap-8 md:gap-16 lg:gap-24">
                        <Reveal
                            initial={{ opacity: 0, y: 100 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.8, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 relative"
                        >
                            <div className="relative w-full h-72 md:h-[40rem] mx-auto overflow-hidden flex items-end justify-center">
                                <Image
                                    src="/images/scott-freeman.png"
                                    alt="Scott Freeman"
                                    fill
                                    className="object-contain object-bottom scale-100 md:scale-110 translate-y-4"
                                />
                                <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-[#111110] via-[#111110]/60 to-transparent z-0" />

                                <Reveal
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.8, delay: 0.3 }}
                                    className="absolute bottom-6 right-6 z-10 text-right"
                                >
                                    <div className="font-extrabold text-2xl md:text-3xl text-white drop-shadow-xl">Scott Freeman</div>
                                    <div className="text-[12px] font-bold text-[#6EE7B7]/80 tracking-[0.3em] mt-1.5 uppercase drop-shadow-md">Biology Education</div>
                                </Reveal>
                            </div>
                        </Reveal>

                        <Reveal
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", bounce: 0.2 }}
                            className="w-full lg:w-1/2 space-y-8"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-[#084734]/10 flex items-center justify-center text-[#6EE7B7] ring-1 ring-[#084734]/30">
                                    <Users className="w-6 h-6" />
                                </div>
                                <h3 className="text-3xl font-bold text-white" style={{ letterSpacing: '-1px' }}>고구조화된 능동적 학습</h3>
                            </div>

                            <blockquote className="border-l-4 border-[#084734]/50 pl-6 py-2 text-xl text-white/70 italic font-medium leading-relaxed bg-gradient-to-r from-[#084734]/5 to-transparent break-keep">
                                &ldquo;전통적인 강의식 수업보다 능동적 학습(Active Learning)에 참여한 학생들의 성취도가 1.5배 더 높으며, 낙제율은 55% 감소한다.&rdquo;
                            </blockquote>

                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-white break-keep">
                                    Classin의 솔루션: <span className="text-[#6EE7B7]">참여형 인터랙티브 클래스</span>
                                </h4>
                                <p className="text-[#A39E98] leading-relaxed text-lg break-keep">
                                    듣기만 하는 수업은 끝났습니다. Classin의 &apos;랜덤 발표&apos;, &apos;실시간 투표&apos;, &apos;화이트보드 공유&apos; 기능은 모든 학생이 매 순간 수업에 참여하게 만듭니다. 고구조화된 수업 설계로 누구도 소외되지 않는 교실을 만듭니다.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#ActiveLearning</span>
                                <span className="px-4 py-1.5 bg-gradient-to-r from-[#2a2925] to-[#2a2925]/80 border border-white/[0.06] text-white/60 text-[13px] font-semibold rounded-full backdrop-blur-sm shadow-[0_1px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] tracking-[0.01em]">#참여수업</span>
                            </div>
                        </Reveal>
                    </div>
                </div>
            </div>
        </section>
    )
}
