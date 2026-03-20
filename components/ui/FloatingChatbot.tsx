"use client"

import { useState } from "react"
import { MessageCircle, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export function FloatingChatbot() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="mb-4 w-[350px] sm:w-[380px] h-[500px] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden"
                    >
                        {/* Chat Header */}
                        <div className="bg-primary p-5 flex items-center justify-between text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                    <MessageCircle className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base">Classin AI 상담봇</h3>
                                    <p className="text-xs text-primary-foreground/90 mt-0.5">24시간 빠른 답변을 제공합니다 ⚡</p>
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
                        <div className="flex-1 p-5 bg-slate-50/50 flex flex-col gap-4 overflow-y-auto">
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <MessageCircle className="w-4 h-4 text-primary" />
                                </div>
                                <div className="bg-white border shadow-sm p-3.5 rounded-2xl rounded-tl-sm text-sm text-slate-700 leading-relaxed">
                                    안녕하세요! Classin에 오신 것을 환영합니다😊 👋<br/><br/>
                                    학원 운영, 도입 관련 문의, 요금제 등 궁금한 점이 있으시다면 언제든 말씀해 주세요.
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-2 pl-11">
                                <button className="text-left text-sm bg-white border border-primary/20 hover:border-primary/50 text-slate-700 p-2.5 rounded-xl transition-colors shadow-sm">
                                    자료를 받아보고 싶어요
                                </button>
                                <button className="text-left text-sm bg-white border border-primary/20 hover:border-primary/50 text-slate-700 p-2.5 rounded-xl transition-colors shadow-sm">
                                    핵심 기능이 궁금해요
                                </button>
                                <button className="text-left text-sm bg-white border border-primary/20 hover:border-primary/50 text-slate-700 p-2.5 rounded-xl transition-colors shadow-sm">
                                    요금제 안내 부탁드려요
                                </button>
                            </div>
                        </div>
                        
                        {/* Chat Input Placeholder */}
                        <div className="p-4 border-t bg-white">
                            <div className="bg-slate-50 border border-slate-200 rounded-full px-5 py-3 text-sm text-slate-400 flex items-center justify-between cursor-text">
                                <span>메시지를 입력하세요...</span>
                                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
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
                className="w-16 h-16 bg-primary text-white rounded-full shadow-[0_8px_30px_rgb(16,185,129,0.3)] flex items-center justify-center hover:bg-primary/90 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary/20"
            >
                {isOpen ? <X className="w-7 h-7" /> : <MessageCircle className="w-7 h-7" />}
            </motion.button>
        </div>
    )
} 
