"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import Link from "next/link"
import { submitLead } from "@/lib/submitLead"
import { trackDemoRequestAdsConversion, trackEvent } from "@/lib/analytics"
import { useToast } from "@/components/ui/toast"
import {
    ACADEMY_SIZE_OPTIONS,
    ACADEMY_SIZE_PLACEHOLDER,
} from "@/lib/contact/academy-size"
import { ContactDirectChannels } from "@/components/contact/ContactDirectChannels"
import { ContactFastTrack } from "@/components/contact/ContactFastTrack"
import { CONTACT_TOPICS, EVENT_CONTACT_TOPICS, isContactTopic } from "@/lib/contact/topics"
import type { PublicEvent } from "@/lib/types/public-events"

const PHONE_ALLOWED_INPUT_PATTERN = /^[\d\s-]*$/
const PHONE_REJECT_ANIMATION_MS = 220
const PHONE_REQUIRED_MESSAGE = "연락처를 입력해주세요."
const PHONE_INVALID_CHARACTER_MESSAGE = "숫자와 하이픈만 입력할 수 있어요."
const PHONE_TOO_LONG_MESSAGE = "전화번호는 최대 11자리까지 입력할 수 있어요."
const PRIVACY_CONSENT_REQUIRED_MESSAGE = "개인정보 수집·이용에 동의해 주세요."
const LEAD_MAGNET_PATTERN = /^[a-z0-9-]{1,120}$/

function getPhoneDigits(value: string) {
    return value.replace(/\D/g, "")
}

function formatPhoneNumber(value: string) {
    const digits = getPhoneDigits(value).slice(0, 11)
    if (digits.startsWith("02")) {
        if (digits.length <= 2) return digits
        if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
        return `${digits.slice(0, 2)}-${digits.slice(2, -4)}-${digits.slice(-4)}`
    }

    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`
}

function getPhoneValidationMessage(value: string) {
    const digits = getPhoneDigits(value)
    if (!digits) return PHONE_REQUIRED_MESSAGE
    if (digits.startsWith("02")) {
        return digits.length === 9 || digits.length === 10
            ? ""
            : "전화번호는 02-000-0000 또는 02-0000-0000 형식으로 입력해주세요."
    }

    return /^0\d{9,10}$/.test(digits)
        ? ""
        : "연락처는 0으로 시작하는 10~11자리 숫자로 입력해주세요."
}

export default function ContactPage() {
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [shake, setShake] = useState(false)
    const [phone, setPhone] = useState("")
    const [phoneError, setPhoneError] = useState("")
    const [phoneRejected, setPhoneRejected] = useState(false)
    const [topic, setTopic] = useState("")
    const [eventSlug, setEventSlug] = useState("")
    const [leadMagnet, setLeadMagnet] = useState("")
    const [message, setMessage] = useState("")
    const [privacyConsent, setPrivacyConsent] = useState(false)
    const [privacyConsentError, setPrivacyConsentError] = useState("")
    // 어떤 필드 때문에 막혔는지. 이게 없으면 에러 하나에 6개 필드가 동시에 흔들리고
    // 스크린리더에도 전부 잘못된 것으로 읽힌다.
    const [errorField, setErrorField] = useState<string | null>(null)
    const [events, setEvents] = useState<PublicEvent[]>([])
    const [eventsLoaded, setEventsLoaded] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)
    const formShakeTimerRef = useRef<number | null>(null)
    const phoneRejectTimerRef = useRef<number | null>(null)
    const toast = useToast()
    const errorMessageId = error ? "contact-form-error" : undefined
    const phoneErrorMessageId = phoneError ? "contact-phone-error" : undefined

    /** 막힌 필드로 데려간다 — 긴 폼에서는 뷰포트 밖 에러가 보이지 않는다. */
    const focusField = (name: string) => {
        const target = formRef.current?.elements.namedItem(name)
        const element = target instanceof HTMLElement ? target : null
        if (!element) return
        element.focus({ preventScroll: true })
        element.scrollIntoView({ block: "center", behavior: "smooth" })
    }

    const showEventPicker = EVENT_CONTACT_TOPICS.has(topic)
    const eventPickerCategory = topic === "세미나 신청" ? "웨비나" : null

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const eventParam = params.get("event")?.trim()
        const sourceParam = params.get("source")?.trim()
        const topicParam = params.get("topic")?.trim()
        const prefillParam = params.get("prefill")?.trim()
        const leadMagnetParam = params.get("lead_magnet")?.trim()

        if (eventParam) {
            setTopic(sourceParam === "seminar" ? "세미나 신청" : "행사 신청")
            setEventSlug(eventParam)
        } else if (isContactTopic(topicParam)) {
            setTopic(topicParam)
        }

        if (prefillParam) {
            setMessage(prefillParam)
        }
        if (leadMagnetParam && LEAD_MAGNET_PATTERN.test(leadMagnetParam)) {
            setLeadMagnet(leadMagnetParam)
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

    useEffect(() => {
        return () => {
            if (formShakeTimerRef.current !== null) {
                window.clearTimeout(formShakeTimerRef.current)
            }
            if (phoneRejectTimerRef.current !== null) {
                window.clearTimeout(phoneRejectTimerRef.current)
            }
        }
    }, [])

    const availableEvents = useMemo(() => {
        const filtered = events.filter((e) => e.status !== "마감" && e.slug)
        if (!eventPickerCategory) return filtered
        return filtered.filter((e) => e.category === eventPickerCategory)
    }, [events, eventPickerCategory])

    const resetForm = () => {
        setSubmitted(false)
        setError("")
        setNotice("")
        setPhone("")
        setPhoneError("")
        setPhoneRejected(false)
        if (phoneRejectTimerRef.current !== null) {
            window.clearTimeout(phoneRejectTimerRef.current)
            phoneRejectTimerRef.current = null
        }
        setTopic("")
        setEventSlug("")
        setMessage("")
        setPrivacyConsent(false)
        setPrivacyConsentError("")
        // 이걸 비우지 않으면 두 번째 문의에 첫 제출의 lead_magnet 이 재첨부되고,
        // 서버 중복키 context 가 leadMagnet 이라 정상 재문의가 409 로 막힐 수 있다.
        setLeadMagnet("")
        setErrorField(null)
        formRef.current?.reset()
    }

    const triggerShake = () => {
        if (formShakeTimerRef.current !== null) {
            window.clearTimeout(formShakeTimerRef.current)
        }
        setShake(true)
        formShakeTimerRef.current = window.setTimeout(() => {
            setShake(false)
            formShakeTimerRef.current = null
        }, 200)
    }

    const rejectPhoneInput = (message: string) => {
        if (phoneRejectTimerRef.current !== null) {
            window.clearTimeout(phoneRejectTimerRef.current)
        }
        setPhoneError(message)
        setPhoneRejected(true)
        phoneRejectTimerRef.current = window.setTimeout(() => {
            setPhoneRejected(false)
            phoneRejectTimerRef.current = null
        }, PHONE_REJECT_ANIMATION_MS)
    }

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value
        const nextDigits = getPhoneDigits(nextValue)

        if (!PHONE_ALLOWED_INPUT_PATTERN.test(nextValue)) {
            rejectPhoneInput(PHONE_INVALID_CHARACTER_MESSAGE)
            return
        }

        if (nextDigits.length > 11) {
            rejectPhoneInput(PHONE_TOO_LONG_MESSAGE)
            return
        }

        setPhone(formatPhoneNumber(nextValue))
        setPhoneError("")
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")
        setNotice("")
        setPhoneError("")
        setErrorField(null)

        const form = e.currentTarget
        const formData = new FormData(form)

        try {
            const topicValue = (formData.get("topic") as string) || topic
            const isEventTopic = EVENT_CONTACT_TOPICS.has(topicValue)
            const selectedEvent = isEventTopic
                ? events.find((e) => e.slug === eventSlug)
                : undefined

            // 목록이 아직 안 왔으면 availableEvents 가 비어 아래 가드를 통과한다.
            // 그 사이 제출하면 어떤 행사인지 없이 접수된다.
            if (isEventTopic && !eventsLoaded) {
                setError("행사 목록을 불러오는 중입니다. 잠시 후 다시 시도해주세요.")
                setErrorField("topic")
                triggerShake()
                focusField("topic")
                setLoading(false)
                return
            }

            if (isEventTopic && availableEvents.length > 0 && !eventSlug) {
                setError("신청하실 행사를 선택해주세요.")
                setErrorField("event-slug")
                triggerShake()
                focusField("event-slug")
                setLoading(false)
                return
            }

            const phoneValidationMessage = getPhoneValidationMessage(phone)
            if (phoneValidationMessage) {
                rejectPhoneInput(phoneValidationMessage)
                focusField("phone")
                setLoading(false)
                return
            }

            if (!privacyConsent) {
                setPrivacyConsentError(PRIVACY_CONSENT_REQUIRED_MESSAGE)
                triggerShake()
                focusField("privacy-consent")
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
                phone,
                email: (formData.get("email") as string) || undefined,
                role: (formData.get("role") as string) || undefined,
                size: (formData.get("size") as string) || undefined,
                message,
                marketingConsent: formData.get("marketing-consent") === "on",
                eventSlug: selectedEvent?.slug ?? undefined,
                leadMagnet: leadMagnet || undefined,
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
                lead_magnet: leadMagnet || undefined,
                event_id: data.conversionEventId,
            })
            // Google Ads 전환: 도입문의 제출 (전환 라벨이 설정된 경우에만 발화)
            trackDemoRequestAdsConversion({
                leadId: data.leadId,
                eventId: data.conversionEventId,
                eventSlug: selectedEvent?.slug,
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
        <div className="min-h-screen bg-[#FAFAF8] pb-24 pt-20 font-sans text-[#111110] selection:bg-[#ECFDF5] sm:pb-28 lg:pb-32">

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
                            className="text-[2rem] leading-[1.12] tracking-tight text-[#111110] sm:text-4xl md:text-[3rem]"
                        >
                            궁금한 점이 있으신가요? <br />
                            운영 상황부터 함께 확인해드립니다.
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-[#615D59] md:text-xl"
                        >
                            도입 문의, 기술 지원, 결제 증빙까지<br />
                            클래스인 전문 매니저가 필요한 다음 단계를 차분히 안내드립니다.
                        </motion.p>
                    </div>
                </div>
            </section>

            <section className="container relative z-10 mx-auto max-w-6xl pb-12 md:pb-16">
                <ContactFastTrack />

                <div className="grid lg:grid-cols-5 gap-6 lg:gap-8 items-stretch">
                    {/* Contact Form */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="lg:col-span-3 h-full"
                    >
                        <Card className="flex h-full w-full flex-col items-center overflow-hidden rounded-[16px] border border-[#E5E5E0] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:rounded-[16px]">
                            <CardHeader className="w-full border-b border-[#E5E5E0] bg-[#F6F5F4]/50 px-5 pb-5 pt-6 md:px-6 md:pt-7">
                                <CardTitle className="text-[1.35rem] font-bold text-[#111110] sm:text-2xl">상담 내용 남기기</CardTitle>
                                <CardDescription className="text-[#615D59] font-medium mt-2">
                                    문의 유형과 현재 상황을 남겨주시면 담당 매니저가 필요한 자료와 확인 순서를 정리해 연락드리겠습니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent id="contact-form" className="flex w-full scroll-mt-28 flex-col items-center space-y-5 px-5 py-5 md:scroll-mt-32 md:px-6 md:py-6">
                                {submitted ? (
                                    <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                                        <CheckCircle2 className="h-14 w-14 text-[#084734]" />
                                        <h3 className="text-2xl font-bold text-[#111110]">상담 요청이 접수되었습니다</h3>
                                        <p className="text-[#615D59] text-lg">담당 매니저가 내용을 확인한 뒤 이어서 안내드리겠습니다.</p>
                                        {notice && <p className="text-sm text-[#A39E98] max-w-md">{notice}</p>}
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
                                        <Label htmlFor="org-name" className="text-[#44514A] font-bold ml-1">학원명 / 기관명 <span className="text-[#084734]">*</span></Label>
                                        <Input id="org-name" name="org-name" placeholder="예: 무궁화 학원" required autoComplete="organization" aria-invalid={errorField === "org-name"} aria-describedby={errorMessageId} className="w-full bg-white border-[#E5E5E0] focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base" />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="name" className="text-[#44514A] font-bold ml-1">담당자 성함 <span className="text-[#084734]">*</span></Label>
                                        <Input id="name" name="name" placeholder="홍길동 원장" required autoComplete="name" aria-invalid={errorField === "name"} aria-describedby={errorMessageId} className="w-full bg-white border-[#E5E5E0] focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base" />
                                    </div>
                                </div>
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="phone" className="text-[#44514A] font-bold ml-1">연락처 <span className="text-[#084734]">*</span></Label>
                                        <Input
                                            id="phone"
                                            name="phone"
                                            placeholder="010-0000-0000"
                                            type="tel"
                                            inputMode="numeric"
                                            autoComplete="tel-national"
                                            required
                                            value={phone}
                                            onChange={handlePhoneChange}
                                            onInvalid={(event) => {
                                                event.preventDefault()
                                                rejectPhoneInput(PHONE_REQUIRED_MESSAGE)
                                            }}
                                            aria-invalid={!!phoneError}
                                            aria-describedby={phoneErrorMessageId ?? errorMessageId}
                                            className={`w-full bg-white h-11 rounded-xl shadow-sm text-base transition-colors ${phoneError ? "border-[#B43E3E]/40 text-[#B43E3E] focus-visible:ring-[#B43E3E]" : "border-[#E5E5E0] focus-visible:ring-[#084734]"}${phoneError || phoneRejected ? " animate-shake" : ""}`}
                                        />
                                        {phoneError && (
                                            <p id="contact-phone-error" role="alert" aria-live="polite" className="px-1 text-sm font-medium text-[#B43E3E]">
                                                {phoneError}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="email" className="text-[#44514A] font-bold ml-1">이메일 (선택)</Label>
                                        <Input id="email" name="email" placeholder="example@classin.com" type="email" autoComplete="email" className="w-full bg-white border-[#E5E5E0] focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base" />
                                    </div>
                                </div>
                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="role" className="text-[#111110] font-bold ml-1">직책 (선택)</Label>
                                        <Input id="role" name="role" placeholder="예: 원장, 부원장, 운영실장" autoComplete="organization-title" className="w-full bg-white border-[#E5E5E0] focus-visible:ring-[#084734] h-11 rounded-xl shadow-sm text-base" />
                                    </div>
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="size" className="text-[#111110] font-bold ml-1">학원 규모 (선택)</Label>
                                        <select
                                            id="size"
                                            name="size"
                                            className="h-11 w-full rounded-xl border border-[#E5E5E0] bg-white px-4 text-base shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734]"
                                        >
                                            <option value="">{ACADEMY_SIZE_PLACEHOLDER}</option>
                                            {ACADEMY_SIZE_OPTIONS.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-3 w-full">
                                    <Label htmlFor="topic" className="text-[#44514A] font-bold ml-1">문의 유형 <span className="text-[#084734]">*</span></Label>
                                    <select
                                        id="topic"
                                        name="topic"
                                        required
                                        aria-invalid={!!error}
                                        aria-describedby={errorMessageId}
                                        className={`h-11 w-full rounded-xl border border-[#E5E5E0] bg-white px-4 text-base shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734]${errorField === "topic" ? " animate-shake" : ""}`}
                                        value={topic}
                                        onChange={(e) => {
                                            setTopic(e.target.value)
                                            setEventSlug("")
                                        }}
                                    >
                                        <option value="" disabled>문의 유형을 선택해주세요</option>
                                        {CONTACT_TOPICS.map((contactTopic) => (
                                            <option key={contactTopic.value} value={contactTopic.value}>
                                                {contactTopic.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {showEventPicker && (
                                    <div className="space-y-3 w-full">
                                        <Label htmlFor="event-slug" className="text-[#44514A] font-bold ml-1">
                                            신청하실 {topic === "세미나 신청" ? "세미나" : "행사"} <span className="text-[#084734]">*</span>
                                        </Label>
                                        {!eventsLoaded ? (
                                            <div className="flex h-11 items-center gap-2 rounded-xl border border-[#E5E5E0] bg-[#F6F5F4] px-4 text-sm text-[#A39E98]">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                목록을 불러오는 중...
                                            </div>
                                        ) : availableEvents.length === 0 ? (
                                            <p className="rounded-xl border border-dashed border-[#E5E5E0] bg-[#F6F5F4] px-4 py-3 text-sm text-[#615D59]">
                                                현재 신청 가능한 {topic === "세미나 신청" ? "세미나" : "행사"}가 없습니다. 아래 문의 내용에 원하시는 일정이나 주제를 적어주세요.
                                            </p>
                                        ) : (
                                            <select
                                                id="event-slug"
                                                name="event-slug"
                                                required
                                                aria-invalid={!!error}
                                                aria-describedby={errorMessageId}
                                                className={`h-11 w-full rounded-xl border border-[#E5E5E0] bg-white px-4 text-base shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#084734]${errorField === "event-slug" ? " animate-shake" : ""}`}
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
                                    <Label htmlFor="message" className="text-[#44514A] font-bold ml-1">문의 내용 <span className="font-medium text-[#A39E98]">(선택)</span></Label>
                                    <textarea
                                        className="w-full resize-none rounded-xl border border-[#E5E5E0] bg-white px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-[#084734] focus:border-transparent transition-all shadow-sm min-h-[110px]"
                                        placeholder="비워두셔도 됩니다. 현재 상황이나 급한 일정이 있다면 적어주세요."
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        id="message"
                                        name="message"
                                        aria-describedby={errorMessageId}
                                    />
                                </div>
                                {/* 개인정보 수집·이용 동의는 필수다. 문구(항목·목적·보유 기간)는 /privacy 2·4·5절과 같은 값을 쓴다 */}
                                <label
                                    htmlFor="privacy-consent"
                                    className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${privacyConsentError ? "border-[#B43E3E]" : "border-black/[0.08] hover:bg-[#F6F5F4]"}`}
                                >
                                    <input
                                        id="privacy-consent"
                                        name="privacy-consent"
                                        type="checkbox"
                                        checked={privacyConsent}
                                        onChange={(e) => {
                                            setPrivacyConsent(e.target.checked)
                                            if (e.target.checked) setPrivacyConsentError("")
                                        }}
                                        aria-invalid={!!privacyConsentError}
                                        aria-describedby={privacyConsentError ? "contact-privacy-error" : undefined}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                                    />
                                    <span className="text-[#44514A]">
                                        상담 진행을 위한 개인정보 수집·이용에 동의합니다.
                                        <span className="ml-1 text-[#084734]">*</span>
                                        <span className="mt-1 block text-[12px] leading-5 text-[#615D59]">
                                            수집 항목: 이름, 소속 기관, 연락처, 이메일, 문의 내용 · 이용 목적: 도입 상담과 고객 지원 · 보유 기간: 마지막 상담일로부터 최대 3년.{" "}
                                            <Link
                                                href="/privacy"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-medium text-[#084734] underline underline-offset-2"
                                            >
                                                개인정보처리방침
                                            </Link>
                                        </span>
                                    </span>
                                </label>
                                {privacyConsentError && (
                                    <p id="contact-privacy-error" role="alert" aria-live="polite" className="w-full px-1 text-sm font-medium text-[#B43E3E]">
                                        {privacyConsentError}
                                    </p>
                                )}
                                <label className="flex w-full items-start gap-3 rounded-2xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-sm text-[#44514A]">
                                    <input
                                        id="marketing-consent"
                                        name="marketing-consent"
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                                    />
                                    <span>
                                        제품 업데이트와 교육 운영 인사이트를 이메일로 받아보겠습니다.
                                        <span className="ml-1 text-[#A39E98]">(선택)</span>
                                    </span>
                                </label>
                                {error && (
                                    <p id="contact-form-error" role="alert" aria-live="polite" className={`text-center text-sm text-[#B43E3E]${shake ? " animate-shake" : ""}`}>{error}</p>
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

                    <ContactDirectChannels />
                </div>
            </section>
        </div>
    )
}
