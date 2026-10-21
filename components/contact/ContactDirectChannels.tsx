"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react"

import { trackEvent } from "@/lib/analytics"

/**
 * 문의 화면 우측의 직접 연락 경로(전화·이메일·목동 쇼룸·지도).
 *
 * 폼 상태와 얽히지 않은 표현 전용 블록이라 화면에서 떼어냈다 — 750줄짜리 단일 파일에
 * 디자인 위반이 숨어 있던 것이 이 화면의 원래 문제였다.
 */
export function ContactDirectChannels() {
    return (
    <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="lg:col-span-2 h-full"
    >
        <div className="flex h-full flex-col rounded-[16px] border border-[#E5E5E0] bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:rounded-[16px] md:p-8">
            <h3 className="text-xl font-bold text-[#111110] mb-5 pb-3 border-b border-[#E5E5E0]">직접 연락하기</h3>

            <div className="space-y-5">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full border border-[#E5E5E0] bg-white flex items-center justify-center shrink-0 text-[#084734]">
                        <Phone className="w-[17px] h-[17px]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#111110] mb-0.5 text-sm">지사 전화</h4>
                        <p className="text-[#615D59] font-medium">02-6958-8566</p>
                        <p className="text-sm text-[#615D59] mt-1">평일 09:00~18:00 (점심시간 12:00~13:00)</p>
                    </div>
                </div>
                
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full border border-[#E5E5E0] bg-white flex items-center justify-center shrink-0 text-[#084734]">
                        <Mail className="w-[17px] h-[17px]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#111110] mb-0.5 text-sm">이메일 문의</h4>
                        <a href="mailto:classinkr@classin.com" className="text-[#615D59] font-medium hover:text-[#084734] transition-colors">classinkr@classin.com</a>
                        <p className="text-sm text-[#615D59] mt-1">답변 평균 대기 시간: 2시간 이내</p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full border border-[#E5E5E0] bg-white flex items-center justify-center shrink-0 text-[#084734]">
                        <MapPin className="w-[17px] h-[17px]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#111110] mb-0.5 text-sm">목동 쇼룸 · 한국 지사</h4>
                        <p className="text-[#615D59] font-medium leading-relaxed">
                            서울시 양천구 목동동로 233-1<br />
                            806호
                        </p>
                        {/* 쇼룸 방문은 날짜·시간대를 골라야 해서 문의 폼과 필드가 다르다 — 전용 예약 화면으로 보낸다. */}
                        <Link
                            href="/showroom"
                            onClick={() => trackEvent("click_cta", { button: "contact_showroom_booking", page: "/contact" })}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] text-sm font-semibold text-[#084734] underline underline-offset-4 transition-colors hover:text-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                        >
                            쇼룸 방문 예약하기
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="mt-auto pt-6 border-t border-[#E5E5E0]">
                <div className="w-full h-36 bg-[#F6F5F4] rounded-2xl border border-[#E5E5E0] overflow-hidden relative">
                    <iframe
                        title="Classin Korea office map"
                        src="https://maps.google.com/maps?q=서울시+양천구+목동동로+233-1&t=&z=17&ie=UTF8&iwloc=&output=embed"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        allowFullScreen={false}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        className="filter grayscale-[0.2] contrast-[1.05] opacity-90 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
                    ></iframe>
                </div>
            </div>
        </div>
    </motion.div>
    )
}
