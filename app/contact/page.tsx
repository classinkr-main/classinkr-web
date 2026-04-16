"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import {
    ArrowRight,
    CheckCircle2,
    Loader2,
    Mail,
    MapPin,
    MessageSquare,
    Phone,
} from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { submitLead } from "@/lib/submitLead"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    FormCheckbox,
    FormHint,
    FormLabel,
    FormMessage,
    marketingFieldClassName,
} from "@/components/ui/marketing-form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
                setNotice("문의는 정상 접수되었지만 일부 연동은 지연 중입니다. 담당자는 계속 확인하고 있어요.")
            }

            trackEvent("submit_demo_request", { source: "contact_page" })
            toast.success("문의가 접수되었어요")
            setSubmitted(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "제출에 실패했습니다. 다시 시도해 주세요."
            setError(msg)
            triggerShake()
        } finally {
            setLoading(false)
        }
    }

    const fieldClassName = `${marketingFieldClassName} h-14 rounded-[18px] text-base${shake ? " animate-shake" : ""}`

    return (
        <div className="min-h-screen bg-[#FDFCF8] pt-20 pb-24 text-slate-900 selection:bg-orange-200">
            <section className="relative overflow-hidden px-4 pt-12 pb-16 md:pt-20">
                <div className="container relative z-10 mx-auto max-w-6xl">
                    <div className="flex flex-col items-center space-y-6 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2 rounded-full border border-orange-200/50 bg-orange-100/50 px-3 py-1 text-sm font-semibold text-[#E05024]"
                        >
                            <span className="h-2 w-2 animate-pulse rounded-full bg-[#E05024]" />
                            상담 및 문의
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.1 }}
                            className="text-4xl font-serif leading-[1.1] tracking-tight text-[#1a1a19] md:text-[4rem]"
                        >
                            궁금한 점이 있다면,
                            <br />
                            차분하게 안내해 드립니다.
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="mx-auto max-w-2xl text-lg font-medium leading-relaxed text-slate-500 md:text-xl"
                        >
                            도입 문의부터 데모 제안까지, ClassIn 매니저가 기관 운영에 맞는 흐름으로 정리해 드릴게요.
                        </motion.p>
                    </div>
                </div>
            </section>

            <section className="container relative z-10 mx-auto max-w-6xl px-4 pb-12">
                <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="mb-20"
                >
                    <div className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.05)] md:p-12">
                        <div className="pointer-events-none absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-orange-50 blur-[80px]" />
                        <div className="pointer-events-none absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-[#ECFDF5] blur-[80px]" />

                        <div className="relative z-10 flex flex-col items-center justify-between gap-10 md:flex-row">
                            <div className="flex-1 space-y-4 text-center md:text-left">
                                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold tracking-wider text-slate-600">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    FAST TRACK
                                </div>
                                <h3 className="text-3xl font-serif font-bold tracking-tight text-slate-900">
                                    더 빠른 상담 채널
                                </h3>
                                <p className="max-w-md text-lg font-medium text-slate-500">
                                    {kakaoChannelUrl
                                        ? "복잡한 입력 없이, 카카오 채널로 바로 담당자와 연결됩니다. 오른쪽 QR 코드를 확인해 주세요."
                                        : "오른쪽 QR 코드를 확인하시거나, 아래 문의 폼으로 바로 도입 상담을 남겨 주세요."}
                                </p>
                                <div className="pt-4">
                                    <a
                                        href={fastTrackHref}
                                        target={kakaoChannelUrl ? "_blank" : undefined}
                                        rel={kakaoChannelUrl ? "noopener noreferrer" : undefined}
                                        onClick={() =>
                                            trackEvent("click_cta", {
                                                button: kakaoChannelUrl ? "contact_kakao_fast_track" : "contact_form_fast_track",
                                            })
                                        }
                                        className="group inline-flex items-center gap-2 font-bold text-[#E05024] transition-colors hover:text-[#C9431A]"
                                    >
                                        {kakaoChannelUrl ? "모바일로 바로 열기" : "문의 폼으로 이동하기"}
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </a>
                                </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-center gap-4">
                                <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-lg">
                                    <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 md:h-40 md:w-40">
                                        <Image
                                            src="/qr-code.png"
                                            alt="카카오 상담 QR 코드"
                                            fill
                                            className="object-contain p-2"
                                        />
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-slate-500">카카오 상담 시작</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="grid items-start gap-12 lg:grid-cols-5 lg:gap-16">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="lg:col-span-3"
                        id="contact-form"
                    >
                        <Card className="w-full overflow-hidden rounded-[2rem] border-slate-100 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
                            <CardHeader className="w-full border-b border-slate-50 bg-slate-50/50 px-8 pt-10 pb-8">
                                <CardTitle className="text-2xl font-bold text-slate-900">
                                    도입 문의 남기기
                                </CardTitle>
                                <CardDescription className="mt-2 font-medium text-slate-500">
                                    기관 규모와 필요하신 기능을 남겨 주시면, 담당 매니저가 가장 적합한 흐름으로 안내드립니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex w-full flex-col items-center space-y-8 px-8 py-10">
                                {submitted ? (
                                    <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
                                        <CheckCircle2 className="h-14 w-14 text-green-500" />
                                        <h3 className="text-2xl font-bold text-slate-900">문의가 접수되었습니다</h3>
                                        <p className="text-lg text-slate-500">담당 매니저가 빠르게 연락드릴게요.</p>
                                        {notice ? <p className="max-w-md text-sm text-slate-400">{notice}</p> : null}
                                        <Button onClick={resetForm} variant="outline" className="mt-4 rounded-[18px]">
                                            추가 문의하기
                                        </Button>
                                    </div>
                                ) : (
                                    <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-8">
                                        <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
                                            <div className="space-y-3">
                                                <FormLabel htmlFor="org-name">기관명 / 기업명 <span className="text-[#E05024]">*</span></FormLabel>
                                                <Input
                                                    id="org-name"
                                                    name="org-name"
                                                    placeholder="예: ClassIn Academy"
                                                    required
                                                    aria-invalid={!!error}
                                                    aria-describedby="contact-error"
                                                    className={fieldClassName}
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <FormLabel htmlFor="name">담당자 성함 <span className="text-[#E05024]">*</span></FormLabel>
                                                <Input
                                                    id="name"
                                                    name="name"
                                                    placeholder="홍길동 / 원장"
                                                    required
                                                    aria-invalid={!!error}
                                                    aria-describedby="contact-error"
                                                    className={fieldClassName}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
                                            <div className="space-y-3">
                                                <FormLabel htmlFor="phone">연락처 <span className="text-[#E05024]">*</span></FormLabel>
                                                <Input
                                                    id="phone"
                                                    name="phone"
                                                    placeholder="010-0000-0000"
                                                    type="tel"
                                                    required
                                                    aria-invalid={!!error}
                                                    aria-describedby="contact-error"
                                                    className={fieldClassName}
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <FormLabel htmlFor="email">이메일 (선택)</FormLabel>
                                                <Input
                                                    id="email"
                                                    name="email"
                                                    placeholder="example@classin.com"
                                                    type="email"
                                                    className={`${marketingFieldClassName} h-14 rounded-[18px] text-base`}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <FormLabel htmlFor="message">문의 내용 <span className="text-[#E05024]">*</span></FormLabel>
                                            <Textarea
                                                id="message"
                                                name="message"
                                                required
                                                aria-invalid={!!error}
                                                aria-describedby="contact-error"
                                                placeholder="현재 겪고 계신 운영 과제나 필요하신 기능을 자유롭게 적어 주세요."
                                                className={`min-h-[168px] text-base${shake ? " animate-shake" : ""}`}
                                            />
                                        </div>

                                        <FormCheckbox
                                            id="marketing-consent"
                                            name="marketing-consent"
                                            label={<>제품 업데이트와 웨비나 소식을 이메일로 받아보겠습니다 <span className="text-[#6C776F]">(선택)</span></>}
                                            description="문의 응답과 별도로, 교육 운영에 도움이 되는 소식을 받아볼 수 있습니다."
                                        />

                                        {error ? (
                                            <FormMessage id="contact-error" role="alert" aria-live="polite">
                                                {error}
                                            </FormMessage>
                                        ) : (
                                            <FormHint>
                                                문의 접수 후 담당 매니저가 기관 규모와 관심 기능을 확인해 가장 적합한 도입 흐름으로 안내드립니다.
                                            </FormHint>
                                        )}

                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            size="xl"
                                            className="mt-4 h-14 w-full rounded-[18px] text-base font-semibold shadow-[0_14px_32px_rgba(8,71,52,0.18)]"
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                    접수 중
                                                </>
                                            ) : (
                                                "문의 제출하기"
                                            )}
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                        className="space-y-6 lg:col-span-2"
                    >
                        <div className="h-full rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.03)] md:p-10">
                            <h3 className="mb-8 border-b border-slate-100 pb-4 text-xl font-bold text-slate-900">
                                직접 연락하기
                            </h3>

                            <div className="space-y-8">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#E05024]">
                                        <Phone className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h4 className="mb-1 font-bold text-slate-900">고객센터</h4>
                                        <p className="text-lg font-medium text-slate-600">02-123-4567</p>
                                        <p className="mt-1 text-sm text-slate-500">평일 09:00 - 18:00 (점심시간 12:00-13:00)</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#084734]">
                                        <Mail className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h4 className="mb-1 font-bold text-slate-900">이메일 문의</h4>
                                        <a href="mailto:support@classin.com" className="font-medium text-slate-600 transition-colors hover:text-[#E05024]">
                                            support@classin.com
                                        </a>
                                        <p className="mt-1 text-sm text-slate-500">평균 응답 시간: 2시간 이내</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                                        <MapPin className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h4 className="mb-1 font-bold text-slate-900">오피스 위치</h4>
                                        <p className="font-medium leading-relaxed text-slate-600">
                                            서울특별시 강남구 테헤란로 123
                                            <br />
                                            ClassIn 타워 15층
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-10 border-t border-slate-100 pt-8">
                                <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3165.357876127395!2d127.03050121531235!3d37.49887197980838!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x357ca1598c47121b%3A0xcfd6dc32f831!2z7ISc7Jq47Yq567OE7IucIOqwmOuCqOq1rCDthYztl6TrmoAxMjM!5e0!3m2!1sko!2skr!4v1680000000000!5m2!1sko!2skr"
                                        width="100%"
                                        height="100%"
                                        style={{ border: 0 }}
                                        allowFullScreen={false}
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                        className="opacity-90 transition-all duration-500 hover:opacity-100"
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}
