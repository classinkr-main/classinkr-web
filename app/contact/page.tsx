"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, MapPin, Phone, Send, ArrowRight, MessageSquare, CheckCircle2, Loader2 } from "lucide-react"
import Image from "next/image"
import { motion } from "framer-motion"
import { submitLead } from "@/lib/submitLead"
import { trackEvent } from "@/lib/analytics"

export default function ContactPage() {
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const form = e.currentTarget
        const formData = new FormData(form)

        try {
            await submitLead({
                source: "contact_page",
                org: formData.get("org-name") as string,
                name: formData.get("name") as string,
                phone: formData.get("phone") as string,
                email: (formData.get("email") as string) || undefined,
                message: formData.get("message") as string,
            })
            trackEvent("submit_demo_request", { source: "contact_page" })
            setSubmitted(true)
        } catch {
            setError("제출에 실패했습니다. 다시 시도해주세요.")
        } finally {
            setLoading(false)
        }
    }
    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-orange-200 pt-20 pb-24">

            {/* Header Section */}
            <section className="relative px-4 pt-12 md:pt-20 pb-16 overflow-hidden">
                <div className="container mx-auto max-w-6xl relative z-10">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100/50 text-[#E05024] text-sm font-semibold border border-orange-200/50"
                        >
                            <span className="w-2 h-2 rounded-full bg-[#E05024] animate-pulse"></span>
                            상담 및 문의
                        </motion.div>
                        
                        <motion.h1 
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.1 }}
                            className="text-4xl md:text-[4rem] font-serif leading-[1.1] tracking-tight text-[#1a1a19]"
                        >
                            궁금한 점이 있으신가요? <br />
                            친절하게 답변해 드립니다.
                        </motion.h1>

                        <motion.p 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed"
                        >
                            도입 문의부터 맞춤형 솔루션 제안까지, 클래스인 전문 매니저가 학원 운영의 고민을 함께 덜어드립니다.
                        </motion.p>
                    </div>
                </div>
            </section>

            <section className="container mx-auto max-w-6xl px-4 relative z-10 pb-12">
                {/* Fast Track Banner */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="mb-20"
                >
                    <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.05)] border border-slate-100 p-8 md:p-12 overflow-hidden relative">
                        {/* Decorative background elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-50 rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none" />
                        
                        <div className="flex flex-col md:flex-row items-center justify-between gap-10 relative z-10">
                            <div className="flex-1 space-y-4 text-center md:text-left">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold tracking-wider mb-2">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    FAST TRACK
                                </div>
                                <h3 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">
                                    가장 빠른 상담 채널
                                </h3>
                                <p className="text-slate-500 text-lg font-medium max-w-md">
                                    복잡한 양식 작성 없이, 클래스인 카카오톡 채널로 즉시 매니저와 연결됩니다. 우측 QR코드를 스캔해주세요.
                                </p>
                                <div className="pt-4">
                                    <button className="inline-flex items-center gap-2 text-[#E05024] font-bold hover:text-[#C9431A] transition-colors group">
                                        모바일로 바로 열기 
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="shrink-0 flex flex-col items-center gap-4">
                                <div className="bg-white p-4 rounded-3xl shadow-lg border border-slate-100">
                                    <div className="w-32 h-32 md:w-40 md:h-40 bg-slate-50 rounded-2xl flex items-center justify-center relative overflow-hidden">
                                        <Image
                                            src="/qr-code.png"
                                            alt="카카오톡 상담 QR코드"
                                            fill
                                            className="object-contain p-2"
                                        />
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-slate-500">카카오톡 스캔</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="grid lg:grid-cols-5 gap-12 lg:gap-16 items-start">
                    {/* Contact Form */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="lg:col-span-3"
                    >
                        <Card className="bg-white border flex flex-col items-center w-full border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.03)] rounded-[2rem] overflow-hidden">
                            <CardHeader className="pb-8 pt-10 px-8 w-full border-b border-slate-50 bg-slate-50/50">
                                <CardTitle className="text-2xl font-bold text-slate-900">도입 문의 남기기</CardTitle>
                                <CardDescription className="text-slate-500 font-medium mt-2">
                                    학원 규모와 원하시는 기능을 남겨주시면, 담당 매니저가 맞춤형 안내 자료와 함께 연락드리겠습니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-8 py-10 space-y-8 flex flex-col items-center w-full">
                                {submitted ? (
                                    <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                                        <CheckCircle2 className="h-14 w-14 text-green-500" />
                                        <h3 className="text-2xl font-bold text-slate-900">문의가 접수되었습니다!</h3>
                                        <p className="text-slate-500 text-lg">담당 매니저가 빠르게 연락드리겠습니다.</p>
                                        <Button onClick={() => setSubmitted(false)} variant="outline" className="mt-4">
                                            추가 문의하기
                                        </Button>
                                    </div>
                                ) : (
                                <form onSubmit={handleSubmit} className="w-full space-y-8">
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="org-name" className="text-slate-700 font-bold ml-1">학원명 / 기관명 <span className="text-[#E05024]">*</span></Label>
                                        <Input id="org-name" name="org-name" placeholder="예: 무궁화 학원" required className="w-full bg-white border-slate-200 focus-visible:ring-[#E05024] h-14 rounded-xl shadow-sm text-base" />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="name" className="text-slate-700 font-bold ml-1">담당자 성함 <span className="text-[#E05024]">*</span></Label>
                                        <Input id="name" name="name" placeholder="홍길동 원장" required className="w-full bg-white border-slate-200 focus-visible:ring-[#E05024] h-14 rounded-xl shadow-sm text-base" />
                                    </div>
                                </div>
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="phone" className="text-slate-700 font-bold ml-1">연락처 <span className="text-[#E05024]">*</span></Label>
                                        <Input id="phone" name="phone" placeholder="010-0000-0000" type="tel" required className="w-full bg-white border-slate-200 focus-visible:ring-[#E05024] h-14 rounded-xl shadow-sm text-base" />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="email" className="text-slate-700 font-bold ml-1">이메일 (선택)</Label>
                                        <Input id="email" name="email" placeholder="example@classin.com" type="email" className="w-full bg-white border-slate-200 focus-visible:ring-[#E05024] h-14 rounded-xl shadow-sm text-base" />
                                    </div>
                                </div>
                                <div className="space-y-3 w-full">
                                    <Label htmlFor="message" className="text-slate-700 font-bold ml-1">문의 내용 <span className="text-[#E05024]">*</span></Label>
                                    <textarea
                                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#E05024] focus:border-transparent transition-all shadow-sm min-h-[160px]"
                                        placeholder="현재 겪고 계신 운영상의 고민이나 필요하신 기능을 자유롭게 적어주세요."
                                        id="message"
                                        name="message"
                                        required
                                    />
                                </div>
                                {error && (
                                    <p className="text-red-500 text-sm text-center">{error}</p>
                                )}
                                <Button type="submit" disabled={loading} className="w-full h-16 text-lg font-bold bg-[#E05024] hover:bg-[#C9431A] text-white rounded-xl shadow-[0_8px_20px_rgba(224,80,36,0.2)] hover:shadow-[0_12px_25px_rgba(224,80,36,0.3)] transition-all hover:-translate-y-0.5 mt-4">
                                    {loading ? (
                                        <><Loader2 className="mr-2 h-5 w-5 animate-spin" />제출 중...</>
                                    ) : (
                                        "문의 제출하기"
                                    )}
                                </Button>
                                </form>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Contact Info */}
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                        className="lg:col-span-2 space-y-6"
                    >
                        <div className="bg-white rounded-[2rem] p-8 md:p-10 border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.03)] h-full">
                            <h3 className="text-xl font-bold text-slate-900 mb-8 pb-4 border-b border-slate-100">직접 연락하기</h3>
                            
                            <div className="space-y-8">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0 text-[#E05024]">
                                        <Phone className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-1">고객센터</h4>
                                        <p className="text-slate-600 font-medium text-lg">02-123-4567</p>
                                        <p className="text-sm text-slate-500 mt-1">평일 09:00 - 18:00 (점심시간 12:00-13:00)</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0 text-blue-600">
                                        <Mail className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-1">이메일 문의</h4>
                                        <a href="mailto:support@classin.com" className="text-slate-600 font-medium hover:text-[#E05024] transition-colors">support@classin.com</a>
                                        <p className="text-sm text-slate-500 mt-1">답변 평균 대기 시간: 2시간 이내</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
                                        <MapPin className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-1">오피스 위치</h4>
                                        <p className="text-slate-600 font-medium leading-relaxed">
                                            서울특별시 강남구 테헤란로 123<br />
                                            (역삼동) 클래스인 타워 15층
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Map */}
                            <div className="mt-10 pt-8 border-t border-slate-100">
                                <div className="w-full h-48 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden relative">
                                    <iframe 
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3165.357876127395!2d127.03050121531235!3d37.49887197980838!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x357ca1598c47121b%3A0xcfd6dc32f831!2z7ISc7Jq47Yq567OE7IucIOqwmOuCqOq1rCDthYztl6TrnoDroZwgMTIz!5e0!3m2!1sko!2skr!4v1680000000000!5m2!1sko!2skr" 
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
                </div>
            </section>
        </div>
    )
}
