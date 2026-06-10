"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import type { PublicEvent } from "@/lib/types/public-events"

const EVENT_TOPICS = new Set(["행사 신청", "세미나 신청"])

export default function ContactPage() {
    const kakaoChannelUrl = process.env.NEXT_PUBLIC_CONTACT_KAKAO_URL?.trim()
    const fastTrackHref = kakaoChannelUrl || "#contact-form"
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [shake, setShake] = useState(false)
    const [topic, setTopic] = useState("")
    const [eventSlug, setEventSlug] = useState("")
    const [events, setEvents] = useState<PublicEvent[]>([])
    const [eventsLoaded, setEventsLoaded] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)
    const toast = useToast()
    const errorMessageId = error ? "contact-form-error" : undefined

    const showEventPicker = EVENT_TOPICS.has(topic)
    const eventPickerCategory = topic === "세미나 신청" ? "웨비나" : null

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const eventParam = params.get("event")?.trim()
        const sourceParam = params.get("source")?.trim()
        const topicParam = params.get("topic")?.trim()

        if (eventParam) {
            setTopic(sourceParam === "seminar" ? "세미나 신청" : "행사 신청")
            setEventSlug(eventParam)
        } else if (topicParam && EVENT_TOPICS.has(topicParam)) {
            setTopic(topicParam)
        }
    }, [])

    useEffect(() => {
        if (!showEventPicker || eventsLoaded) return
        let cancelled = false
        fetch("/api/events", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (cancelled) return
                setEvents(Array.isArray(data) ? data : [])
                setEventsLoaded(true)
            })
            .catch(() => {
                if (cancelled) return
                setEvents([])
                setEventsLoaded(true)
            })
        return () => {
            cancelled = true
        }
    }, [showEventPicker, eventsLoaded])

    const availableEvents = useMemo(() => {
        const filtered = events.filter((e) => e.status !== "마감" && e.slug)
        if (!eventPickerCategory) return filtered
        return filtered.filter((e) => e.category === eventPickerCategory)
    }, [events, eventPickerCategory])

    const resetForm = () => {
        setSubmitted(false)
        setError("")
        setNotice("")
        setTopic("")
        setEventSlug("")
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
            const topicValue = (formData.get("topic") as string) || topic
            const isEventTopic = EVENT_TOPICS.has(topicValue)
            const selectedEvent = isEventTopic
                ? events.find((e) => e.slug === eventSlug)
                : undefined

            if (isEventTopic && availableEvents.length > 0 && !eventSlug) {
                setError("신청하실 행사를 선택해주세요.")
                triggerShake()
                setLoading(false)
                return
            }

            const message = [
                topicValue ? `문의 유형: ${topicValue}` : undefined,
                selectedEvent ? `신청 행사: ${selectedEvent.title}` : undefined,
                formData.get("message") as string,
            ]
                .filter(Boolean)
                .join("\n")

            const data = await submitLead({
                source: "contact_page",
                sourceDetail: topicValue,
                org: formData.get("org-name") as string,
                name: formData.get("name") as string,
                phone: formData.get("phone") as string,
                email: (formData.get("email") as string) || undefined,
                message,
                marketingConsent: formData.get("marketing-consent") === "on",
                eventSlug: selectedEvent?.slug ?? undefined,
                website: (formData.get("website") as string) || undefined,
            })

            if (Array.isArray(data.warnings) && data.warnings.length > 0) {
                setNotice("상담 요청은 접수되었지만 일부 내부 알림 연동이 지연되었습니다. 기록은 정상 등록되었습니다.")
            }
            trackEvent("submit_demo_request", {
                source: "contact_page",
                lead_id: data.leadId,
                stored: data.stored,
                event_slug: selectedEvent?.slug,
            })
            toast.success("상담 요청이 접수되었어요")
            setSubmitted(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "상담 요청을 제출하지 못했습니다. 잠시 후 다시 시도해주세요."
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
                            운영 상황부터 함께 확인해드립니다.
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-slate-500 md:text-xl"
                        >
                            도입 문의, 기술 지원, 결제 증빙까지<br />
                            클래스인 전문 매니저가 필요한 다음 단계를 차분히 안내드립니다.
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

                            <div className="shrink-0 flex flex-col items-center gap-4">
                                <div className="rounded-[22px] border border-[#22A366]/25 bg-[#E9F8F1] p-1.5 shadow-[0_18px_45px_rgba(8,71,52,0.12)] sm:rounded-[26px] sm:p-2">
                                    <div className="w-40 h-40 md:h-48 md:w-48 bg-white rounded-[18px] flex items-center justify-center relative overflow-hidden ring-1 ring-[#22A366]/10">
                                        <Image
                                            src="/qr-code.png"
                                            alt="카카오톡 상담 QR코드"
                                            fill
                                            sizes="(max-width: 768px) 160px, 192px"
                                            className="object-contain p-1.5"
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
                                <CardTitle className="text-[1.35rem] font-bold text-slate-900 sm:text-2xl">상담 내용 남기기</CardTitle>
                                <CardDescription className="text-slate-500 font-medium mt-2">
                                    문의 유형과 현재 상황을 남겨주시면 담당 매니저가 필요한 자료와 확인 순서를 정리해 연락드리겠습니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent id="contact-form" className="flex w-full scroll-mt-28 flex-col items-center space-y-5 px-5 py-5 md:scroll-mt-32 md:px-6 md:py-6">
                                {submitted ? (
                                    <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                                        <CheckCircle2 className="h-14 w-14 text-green-500" />
                                        <h3 className="text-2xl font-bold text-slate-900">상담 요청이 접수되었습니다</h3>
                                        <p className="text-slate-500 text-lg">담당 매니저가 내용을 확인한 뒤 이어서 안내드리겠습니다.</p>
                                        {notice && <p className="text-sm text-slate-400 max-w-md">{notice}</p>}
                                        <Button onClick={resetForm} variant="outline" className="mt-4">
                                            추가 상담 남기기
                                        </Button>
                                    </div>
                                ) : (
                                <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-6 md:space-y-8">
                                {/* 스팸 봇 honeypot — 사용자에게 보이지 않으며 값이 채워지면 서버가 무시 */}
                                <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
                                    <label htmlFor="contact-website">Website</label>
                                    <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                                </div>
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="org-name" className="text-slate-700 font-bold ml-1">학원명 / 기관명 <span className="text-[#084734]">*</span></Label>
                                        <Input id="org-name" name="org-name" placeholder="예: 무궁화 학원" required aria-invalid={!!error} aria-describedby={errorMessageId} className={`w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base${shake ? " animate-shake" : ""}`} />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="name" className="text-slate-700 font-bold ml-1">담당자 성함 <span className="text-[#084734]">*</span></Label>
                                        <Input id="name" name="name" placeholder="홍길동 원장" required aria-invalid={!!error} aria-describedby={errorMessageId} className={`w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base${shake ? " animate-shake" : ""}`} />
                                    </div>
                                </div>
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="phone" className="text-slate-700 font-bold ml-1">연락처 <span className="text-[#084734]">*</span></Label>
                                        <Input id="phone" name="phone" placeholder="010-0000-0000" type="tel" required aria-invalid={!!error} aria-describedby={errorMessageId} className={`w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base${shake ? " animate-shake" : ""}`} />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="email" className="text-slate-700 font-bold ml-1">이메일 (선택)</Label>
                                        <Input id="email" name="email" placeholder="example@classin.com" type="email" className="w-full bg-white border-slate-200 focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base" />
                                    </div>
                                </div>
                                <div className="space-y-3 w-full">
                                    <Label htmlFor="topic" className="text-slate-700 font-bold ml-1">문의 유형 <span className="text-[#084734]">*</span></Label>
                                    <select
                                        id="topic"
                                        name="topic"
                                        required
                                        aria-invalid={!!error}
                                        aria-describedby={errorMessageId}
                                        className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-base shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734]${shake ? " animate-shake" : ""}`}
                                        value={topic}
                                        onChange={(e) => {
                                            setTopic(e.target.value)
                                            setEventSlug("")
                                        }}
                                    >
                                        <option value="" disabled>문의 유형을 선택해주세요</option>
                                        <option value="도입 상담">도입 상담</option>
                                        <option value="수업 운영 상담">수업 운영 상담</option>
                                        <option value="결제/영수증/계약">결제/영수증/계약</option>
                                        <option value="계정/접속/기술 지원">계정/접속/기술 지원</option>
                                        <option value="하드웨어/설치/AS">하드웨어/설치/AS</option>
                                        <option value="행사 신청">행사 신청</option>
                                        <option value="세미나 신청">세미나 신청</option>
                                    </select>
                                </div>
                                {showEventPicker && (
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="event-slug" className="text-slate-700 font-bold ml-1">
                                            신청하실 {topic === "세미나 신청" ? "세미나" : "행사"} <span className="text-[#084734]">*</span>
                                        </Label>
                                        {!eventsLoaded ? (
                                            <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-400">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                목록을 불러오는 중...
                                            </div>
                                        ) : availableEvents.length === 0 ? (
                                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                                현재 신청 가능한 {topic === "세미나 신청" ? "세미나" : "행사"}가 없습니다. 아래 문의 내용에 원하시는 일정이나 주제를 적어주세요.
                                            </p>
                                        ) : (
                                            <select
                                                id="event-slug"
                                                name="event-slug"
                                                required
                                                aria-invalid={!!error}
                                                aria-describedby={errorMessageId}
                                                className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-base shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734]${shake ? " animate-shake" : ""}`}
                                                value={eventSlug}
                                                onChange={(e) => setEventSlug(e.target.value)}
                                            >
                                                <option value="" disabled>{topic === "세미나 신청" ? "세미나" : "행사"}를 선택해주세요</option>
                                                {availableEvents.map((e) => (
                                                    <option key={e.id} value={e.slug ?? ""}>
                                                        {e.title}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}
                                <div className="space-y-3 w-full">
                                    <Label htmlFor="message" className="text-slate-700 font-bold ml-1">문의 내용 <span className="text-[#084734]">*</span></Label>
                                    <textarea
                                        className={`w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#084734] focus:border-transparent transition-all shadow-sm min-h-[110px]${shake ? " animate-shake" : ""}`}
                                        placeholder="현재 상황, 원하는 상담 결과, 급한 일정이 있다면 함께 적어주세요."
                                        id="message"
                                        name="message"
                                        required
                                        aria-invalid={!!error}
                                        aria-describedby={errorMessageId}
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
                                        제품 업데이트와 교육 운영 인사이트를 이메일로 받아보겠습니다.
                                        <span className="ml-1 text-slate-400">(선택)</span>
                                    </span>
                                </label>
                                {error && (
                                    <p id="contact-form-error" role="alert" aria-live="polite" className="text-red-600 text-sm text-center">{error}</p>
                                )}
                                <Button type="submit" disabled={loading} className="w-full h-12 text-base font-bold bg-[#084734] hover:bg-[#065c41] text-white rounded-xl shadow-[0_8px_20px_rgba(8,71,52,0.18)] hover:shadow-[0_12px_25px_rgba(8,71,52,0.26)] transition-all hover:-translate-y-0.5 mt-4">
                                    {loading ? (
                                        <><Loader2 className="mr-2 h-5 w-5 animate-spin" />상담 요청 접수 중...</>
                                    ) : (
                                        "상담 요청 제출하기"
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
                </div>
            </section>
        </div>
    )
}
