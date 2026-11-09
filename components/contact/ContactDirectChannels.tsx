"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react"

import { ContactMap } from "@/components/contact/ContactMap"
import { trackEvent } from "@/lib/analytics"

/**
 * 문의 화면 우측의 직접 연락 경로(전화·이메일·목동 쇼룸·일러스트 지도 ContactMap).
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
                    <div className="w-10 h-10 rounded-full border border-[#E5E5E0] bg-white flex items-center justify-center shrink-0 text-fg-accent">
                        <Phone className="w-[17px] h-[17px]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#111110] mb-0.5 text-sm">지사 전화</h4>
                        {/* tel:·mailto: 링크는 ContactLinkTracker 가 click_to_call·click_email 로 센다(번호·주소는
                            보내지 않는다). data-track-location 은 그 이벤트의 link_location 값이다. */}
                        <a
                            href="tel:02-6958-8566"
                            data-track-location="contact_page"
                            className="text-[#615D59] font-medium hover:text-fg-accent transition-colors"
                        >
                            02-6958-8566
                        </a>
                        <p className="text-sm text-[#615D59] mt-1">평일 09:00~18:00 (점심시간 12:00~13:00)</p>
                    </div>
                </div>
                
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full border border-[#E5E5E0] bg-white flex items-center justify-center shrink-0 text-fg-accent">
                        <Mail className="w-[17px] h-[17px]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#111110] mb-0.5 text-sm">이메일 문의</h4>
                        <a href="mailto:classinkr@classin.com" data-track-location="contact_page" className="text-[#615D59] font-medium hover:text-fg-accent transition-colors">classinkr@classin.com</a>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full border border-[#E5E5E0] bg-white flex items-center justify-center shrink-0 text-fg-accent">
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
                            className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] text-sm font-semibold text-fg-accent underline underline-offset-4 transition-colors hover:text-fg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent"
                        >
                            쇼룸 방문 예약하기
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* 지도 — 남는 세로 공간을 일러스트 지도가 채운다(V24-A) */}
            <div className="mt-auto pt-6 border-t border-[#E5E5E0]">
                <ContactMap />
            </div>
        </div>
    </motion.div>
    )
}
