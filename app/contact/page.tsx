"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, MapPin, Phone, ArrowRight, MessageSquare, CheckCircle2, Loader2 } from "lucide-react"
import Image from "next/image"
import { motion } from "framer-motion"
import { submitLead } from "@/lib/submitLead"
import { trackEvent } from "@/lib/analytics"
import { useToast } from "@/components/ui/toast"

export default function ContactPage() {
    const kakaoChannelUrl = process.env.NEXT_PUBLIC_CONTACT_KAKAO_URL?.trim()
    const fastTrackHref = kakaoChannelUrl || "#contact-form"
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [shake, setShake] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)
    const toast = useToast()

    const resetForm = () => {
        setSubmitted(false)
        setError("")
        setNotice("")
        formRef.current?.reset()
    }

    const triggerShake = () => {
        setShake(true)
        setTimeout(() => setShake(false), 200)
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")
        setNotice("")

        const form = e.currentTarget
        const formData = new FormData(form)

        try {
            const data = await submitLead({
                source: "contact_page",
                org: formData.get("org-name") as string,
                name: formData.get("name") as string,
                phone: formData.get("phone") as string,
                email: (formData.get("email") as string) || undefined,
                message: formData.get("message") as string,
                marketingConsent: formData.get("marketing-consent") === "on",
            })

            if (Array.isArray(data.warnings) && data.warnings.length > 0) {
                setNotice("문의는 접수되었지만 일부 외부 연동이 지연되었습니다. 내부 시스템에는 정상 등록되었습니다.")
            }
            trackEvent("submit_demo_request", { source: "contact_page" })
            toast.success("문의가 접수되었어요")
            setSubmitted(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "제출에 실패했습니다. 다시 시도해주세요."
            setError(msg)
            triggerShake()
        } finally {
            setLoading(false)
        }
    }
    return (
        <div className="min-h-screen bg-[#EDF7F2] pb-24 pt-20 font-sans text-slate-900 selection:bg-[#ECFDF5] sm:pb-28 lg:pb-32">

            {/* Header Section */}
            <section className="relative overflow-hidden px-4 pb-7 pt-7 md:pb-8 md:pt-12">
                <div className="container mx-auto max-w-6xl relative z-10">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ECFDF5] text-[#084734] text-sm font-semibold border border-[#D1FAE5]"
                        >
                            <span className="w-2 h-2 rounded-full bg-[#084734] animate-pulse"></span>
                            상담 및 문의
                        </motion.div>
                        
                        <motion.h1 
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.1 }}
                            className="text-[2rem] font-serif leading-[1.12] tracking-tight text-[#1a1a19] sm:text-4xl md:text-[3rem]"
                        >
                            궁금한 점이 있으신가요? <br />
                            친절하게 답변해 드립니다.
                        </motion.h1>

                        <motion.p 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-slate-500 md:text-xl"
                        >
                            도입 문의부터 맞춤형 솔루션 제안까지,<br />
                            클래스인 전문 매니저가 학원 운영의 고민을 함께 덜어드립니다.
                        </motion.p>
                    </div>
                </div>
            </section>

            <section className="container relative z-10 mx-auto max-w-6xl pb-12 md:pb-16">
                {/* Fast Track Banner */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="mb-8 md:mb-10"
                >
                    <div className="relative overflow-hidden rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.05)] md:rounded-[2rem] md:p-8">
                        {/* Decorative background elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#ECFDF5] rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#ECFDF5] rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none" />
                        
                        <div className="relative z-10 flex flex-col items-center justify-between gap-7 md:flex-row md:gap-10">
                            <div className="flex-1 space-y-4 text-center md:text-left">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold tracking-wider mb-2">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    FAST TRACK
                                </div>
                                <h3 className="text-2xl font-serif font-bold tracking-tight text-slate-900 sm:text-3xl">
                                    가장 빠른 상담 채널
                                </h3>
                                <p className="max-w-md text-base font-medium leading-relaxed text-slate-500 sm:text-lg">
                                    {kakaoChannelUrl ? (
                                        "복잡한 양식 작성 없이, 클래스인 카카오톡 채널로 즉시 매니저와 연결됩니다. QR코드를 스캔해주세요."
                                    ) : (
                                        <>
                                            QR 코드를 확인하시거나,<br />
                                            아래 문의 폼으로 바로 도입 상담을 남겨보세요.
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

                            <div className="shrink-0 flex flex-col items-center gap-4">
                                <div className="rounded-[20px] border border-[#1c1917] bg-[#292524] p-3 shadow-lg sm:rounded-3xl sm:p-4">
                                    <div className="w-32 h-32 md:w-40 md:h-40 bg-white rounded-2xl flex items-center justify-center relative overflow-hidden">
                                        <Image
                                            src="/qr-code.png"
                                            alt="카카오톡 상담 QR코드"
                                            fill
                                            sizes="(max-width: 768px) 128px, 160px"
                                            className="object-contain p-2"
                                        />
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-slate-500">카카오채널 스캔</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="grid lg:grid-cols-5 gap-6 lg:gap-8 items-stretch">
                    {/* Contact Form */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="lg:col-span-3 h-full"
                    >
                        <Card className="flex h-full w-full flex-col items-center overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:rounded-[2rem]">
                            <CardHeader className="w-full border-b border-slate-50 bg-slate-50/50 px-5 pb-5 pt-6 md:px-6 md:pt-7">
                                <CardTitle className="text-[1.35rem] font-bold text-slate-900 sm:text-2xl">도입 문의 남기기</CardTitle>
                                <CardDescription className="text-slate-500 font-medium mt-2">
                                    학원 규모와 원하시는 기능을 남겨주시면, 담당 매니저가 맞춤형 안내 자료와 함께 연락드리겠습니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent id="contact-form" className="flex w-full scroll-mt-28 flex-col items-center space-y-5 px-5 py-5 md:scroll-mt-32 md:px-6 md:py-6">
                                {submitted ? (
                                    <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                                        <CheckCircle2 className="h-14 w-14 text-green-500" />
                                        <h3 className="text-2xl font-bold text-slate-900">문의가 접수되었습니다!</h3>
                                        <p className="text-slate-500 text-lg">담당 매니저가 빠르게 연락드리겠습니다.</p>
                                        {notice && <p className="text-sm text-slate-400 max-w-md">{notice}</p>}
                                        <Button onClick={resetForm} variant="outline" className="mt-4">
                                            추가 문의하기
                                        </Button>
                                    </div>
                                ) : (
                                <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-6 md:space-y-8">
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="org-name" className="text-slate-700 font-bold ml-1">학원명 / 기관명 <span className="text-[#084734]">*</span></Label>
                                        <Input id="org-name" name="org-name" placeholder="예: 무궁화 학원" required aria-invalid={!!error} aria-describedby="org-name-error" className={`w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base${shake ? " animate-shake" : ""}`} />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="name" className="text-slate-700 font-bold ml-1">담당자 성함 <span className="text-[#084734]">*</span></Label>
                                        <Input id="name" name="name" placeholder="홍길동 원장" required aria-invalid={!!error} aria-describedby="name-error" className={`w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base${shake ? " animate-shake" : ""}`} />
                                    </div>
                                </div>
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="phone" className="text-slate-700 font-bold ml-1">연락처 <span className="text-[#084734]">*</span></Label>
                                        <Input id="phone" name="phone" placeholder="010-0000-0000" type="tel" required aria-invalid={!!error} aria-describedby="phone-error" className={`w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base${shake ? " animate-shake" : ""}`} />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="email" className="text-slate-700 font-bold ml-1">이메일 (선택)</Label>
                                        <Input id="email" name="email" placeholder="example@classin.com" type="email" className="w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base" />
                                    </div>
                                </div>
                                <div className="space-y-3 w-full">
                                    <Label htmlFor="message" className="text-slate-700 font-bold ml-1">문의 내용 <span className="text-[#084734]">*</span></Label>
                                    <textarea
                                        className={`w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#084734] focus:border-transparent transition-all shadow-sm min-h-[110px]${shake ? " animate-shake" : ""}`}
                                        placeholder="현재 겪고 계신 운영상의 고민이나 필요하신 기능을 자유롭게 적어주세요."
                                        id="message"
                                        name="message"
                                        required
                                        aria-invalid={!!error}
                                        aria-describedby="message-error"
                                    />
                                </div>
                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                                    <input
                                        id="marketing-consent"
                                        name="marketing-consent"
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#084734] focus:ring-[#084734]"
                                    />
                                    <span>
                                        제품 업데이트와 이벤트 소식을 이메일로 받아보겠습니다.
                                        <span className="ml-1 text-slate-400">(선택)</span>
                                    </span>
                                </label>
                                {error && (
                                    <p id="message-error" role="alert" aria-live="polite" className="text-red-600 text-sm text-center">{error}</p>
                                )}
                                <Button type="submit" disabled={loading} className="w-full h-12 text-base font-bold bg-[#084734] hover:bg-[#065c41] text-white rounded-xl shadow-[0_8px_20px_rgba(8,71,52,0.18)] hover:shadow-[0_12px_25px_rgba(8,71,52,0.26)] transition-all hover:-translate-y-0.5 mt-4">
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
                        className="lg:col-span-2 h-full"
                    >
                        <div className="flex h-full flex-col rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:rounded-[2rem] md:p-8">
                            <h3 className="text-xl font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">직접 연락하기</h3>

                            <div className="space-y-5">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center shrink-0 text-[#084734]">
                                        <Phone className="w-[17px] h-[17px]" strokeWidth={1.8} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-0.5 text-sm">지사 전화</h4>
                                        <p className="text-slate-600 font-medium">02-6958-8566</p>
                                        <p className="text-sm text-slate-500 mt-1">평일 09:00 - 18:00 (점심시간 12:00-13:00)</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center shrink-0 text-[#084734]">
                                        <Mail className="w-[17px] h-[17px]" strokeWidth={1.8} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-0.5 text-sm">이메일 문의</h4>
                                        <a href="mailto:support@classin.com" className="text-slate-600 font-medium hover:text-[#084734] transition-colors">support@classin.com</a>
                                        <p className="text-sm text-slate-500 mt-1">답변 평균 대기 시간: 2시간 이내</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center shrink-0 text-[#084734]">
                                        <MapPin className="w-[17px] h-[17px]" strokeWidth={1.8} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 mb-0.5 text-sm">오피스 위치</h4>
                                        <p className="text-slate-600 font-medium leading-relaxed">
                                            서울시 양천구 목동동로 233-1<br />
                                            806호
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Map */}
                            <div className="mt-auto pt-6 border-t border-slate-100">
                                <div className="w-full h-36 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden relative">
                                    <iframe
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
                </div>
            </section>
        </div>
    )
}
