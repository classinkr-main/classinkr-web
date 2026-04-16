"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { MessageCircle, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname"

export function FloatingChatbot() {
    const pathname = usePathname()
    const [isOpen, setIsOpen] = useState(false)

    if (pathname.startsWith("/admin") || isPartnerPortalPath(pathname)) {
        return null
    }

    return (
        <div className="fixed right-4 z-50 hidden items-end md:flex md:right-6 md:bottom-6">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="mb-4 flex h-[500px] w-[calc(100vw-1.5rem)] max-w-[350px] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[rgba(0,0,0,0.08)_0px_20px_60px,rgba(0,0,0,0.04)_0px_8px_20px] lg:max-w-[380px]"
                    >
                        {/* Chat Header */}
                        <div className="bg-[#084734] p-5 flex items-center justify-between text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                    <MessageCircle className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base">Classin AI 상담봇</h3>
                                    <p className="text-xs text-white/75 mt-0.5">24시간 빠른 답변을 제공합니다 ⚡</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Chat Body */}
                        <div className="flex-1 p-5 bg-[#F6F5F4]/50 flex flex-col gap-4 overflow-y-auto">
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#ECFDF5] flex items-center justify-center shrink-0">
                                    <MessageCircle className="w-4 h-4 text-[#084734]" />
                                </div>
                                <div className="bg-white border border-black/[0.06] shadow-sm p-3.5 rounded-2xl rounded-tl-sm text-sm text-[#111110] leading-relaxed">
                                    안녕하세요! Classin에 오신 것을 환영합니다😊 👋<br/><br/>
                                    학원 운영, 도입 관련 문의, 요금제 등 궁금한 점이 있으시다면 언제든 말씀해 주세요.
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 pl-11">
                                <button className="text-left text-sm bg-white border border-[#084734]/20 hover:border-[#084734]/50 text-[#111110] p-2.5 rounded-xl transition-colors shadow-sm">
                                    자료를 받아보고 싶어요
                                </button>
                                <button className="text-left text-sm bg-white border border-[#084734]/20 hover:border-[#084734]/50 text-[#111110] p-2.5 rounded-xl transition-colors shadow-sm">
                                    핵심 기능이 궁금해요
                                </button>
                                <button className="text-left text-sm bg-white border border-[#084734]/20 hover:border-[#084734]/50 text-[#111110] p-2.5 rounded-xl transition-colors shadow-sm">
                                    요금제 안내 부탁드려요
                                </button>
                            </div>
                        </div>

                        {/* Chat Input Placeholder */}
                        <div className="p-4 border-t border-black/[0.06] bg-white">
                            <div className="bg-[#F6F5F4] border border-black/[0.08] rounded-full px-5 py-3 text-sm text-[#A39E98] flex items-center justify-between cursor-text">
                                <span>메시지를 입력하세요...</span>
                                <div className="w-6 h-6 bg-[#084734] rounded-full flex items-center justify-center">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className="w-16 h-16 bg-[#084734] text-white rounded-full shadow-[0_8px_30px_rgba(8,71,52,0.35)] flex items-center justify-center hover:bg-[#065c41] transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[#084734]/20"
            >
                {isOpen ? <X className="w-7 h-7" /> : <MessageCircle className="w-7 h-7" />}
            </motion.button>
        </div>
    )
}
