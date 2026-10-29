"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowRight, MessageSquare } from "lucide-react"

import { trackEvent } from "@/lib/analytics"

/**
 * 문의 화면 상단의 빠른 상담 채널 배너.
 *
 * 채널 URL(`NEXT_PUBLIC_CONTACT_KAKAO_URL`)이 비어 있으면 CTA 가 폼 앵커로 바뀌고 QR
 * 블록은 아예 그리지 않는다 — 스캔해도 아무 일이 없는 블록이 폼 위를 차지하던 자리다.
 */
export function ContactFastTrack() {
    const kakaoChannelUrl = process.env.NEXT_PUBLIC_CONTACT_KAKAO_URL?.trim()
    const fastTrackHref = kakaoChannelUrl || "#contact-form"

    return (
    <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mb-8 md:mb-10"
    >
        <div className="relative overflow-hidden rounded-[16px] border border-[#E5E5E0] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.05)] md:rounded-[16px] md:p-8">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#ECFDF5] rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#ECFDF5] rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center justify-between gap-7 md:flex-row md:gap-10">
                <div className="flex-1 space-y-4 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F6F5F4] text-[#615D59] text-xs font-bold tracking-wider mb-2">
                        <MessageSquare className="w-3.5 h-3.5" />
                        FAST TRACK
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight text-[#111110] sm:text-3xl">
                        가장 빠른 상담 채널
                    </h3>
                    <p className="max-w-md text-base font-medium leading-relaxed text-[#615D59] sm:text-lg">
                        {kakaoChannelUrl ? (
                            "복잡한 양식 없이 클래스인 카카오톡 채널로 바로 연결됩니다. 급한 CS나 도입 상담은 QR코드를 스캔해주세요."
                        ) : (
                            <>
                                QR 코드를 확인하시거나,<br />
                                아래 문의 폼으로 상담 내용을 남겨주세요.
                            </>
                        )}
                    </p>
                    <div className="pt-4">
                        <a
                            href={fastTrackHref}
                            target={kakaoChannelUrl ? "_blank" : undefined}
                            rel={kakaoChannelUrl ? "noopener noreferrer" : undefined}
                            onClick={() => trackEvent("click_cta", { button: kakaoChannelUrl ? "contact_kakao_fast_track" : "contact_form_fast_track" })}
                            className="inline-flex items-center gap-2 text-[#084734] font-bold hover:text-[#065c41] transition-colors group"
                        >
                            {kakaoChannelUrl ? "모바일로 바로 열기" : "문의 폼 바로가기"}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </a>
                    </div>
                </div>

                {/* 채널 URL 이 없으면 CTA 는 폼 앵커로 바뀌는데 QR 만 남으면
                    스캔해도 아무 일이 없는 블록이 폼 위를 차지한다. */}
                {kakaoChannelUrl ? (
                <div className="shrink-0 flex flex-col items-center gap-4">
                    <div className="rounded-[16px] border border-[#084734]/25 bg-[#ECFDF5] p-1.5 shadow-[0_18px_45px_rgba(8,71,52,0.12)] sm:rounded-[16px] sm:p-2">
                        <div className="w-40 h-40 md:h-48 md:w-48 bg-white rounded-[12px] flex items-center justify-center relative overflow-hidden ring-1 ring-[#084734]/10">
                            <Image
                                src="/qr-code.png"
                                alt="카카오톡 상담 QR코드"
                                fill
                                sizes="(max-width: 768px) 160px, 192px"
                                className="object-contain p-1.5"
                            />
                        </div>
                    </div>
                    <span className="text-sm font-medium text-[#615D59]">카카오채널 스캔</span>
                </div>
                ) : null}
            </div>
        </div>
    </motion.div>
    )
}
