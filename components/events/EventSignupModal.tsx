"use client"

import React, { useRef, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { submitLead } from "@/lib/submitLead"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    FormCheckbox,
    FormHint,
    FormLabel,
    FormMessage,
    marketingFieldClassName,
    marketingSurfaceClassName,
} from "@/components/ui/marketing-form"
import { Input } from "@/components/ui/input"

interface EventSignupModalProps {
    eventSlug: string
    eventTitle: string
    /** 트리거로 쓸 버튼/링크 요소 */
    children: React.ReactNode
    /** 추적용 CTA 위치 식별자 */
    trackingButton?: string
}

/**
 * 행사 상세 페이지 인라인 신청 모달.
 * /contact 페이지 이동 없이 그 자리에서 신청 — 서버는 기존
 * contact_page 소스 + eventSlug 경로를 그대로 사용한다.
 */
export function EventSignupModal({
    eventSlug,
    eventTitle,
    children,
    trackingButton = "event_detail_signup_modal",
}: EventSignupModalProps) {
    const [open, setOpen] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [marketingConsent, setMarketingConsent] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)
    const toast = useToast()

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            trackEvent("click_cta", { button: trackingButton, page: `/events/${eventSlug}` })
        } else {
            setSubmitted(false)
            setError("")
            setMarketingConsent(false)
            formRef.current?.reset()
        }
        setOpen(nextOpen)
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const formData = new FormData(e.currentTarget)

        try {
            const data = await submitLead({
                source: "contact_page",
                sourceDetail: "행사 신청",
                name: formData.get("name") as string,
                org: formData.get("org") as string,
                phone: formData.get("phone") as string,
                email: (formData.get("email") as string) || undefined,
                message: `문의 유형: 행사 신청\n신청 행사: ${eventTitle}`,
                marketingConsent,
                eventSlug,
                website: (formData.get("website") as string) || undefined,
            })
            trackEvent("submit_demo_request", {
                source: "contact_page",
                lead_id: data.leadId,
                stored: data.stored,
                event_slug: eventSlug,
            })
            toast.success("행사 신청이 접수되었어요")
            setSubmitted(true)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "신청을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[480px] overflow-hidden border-[#E4E8E2] bg-[#FBFCF9] p-0">
                {submitted ? (
                    <div className="flex flex-col items-center justify-center space-y-4 px-8 py-12 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5]">
                            <CheckCircle2 className="h-7 w-7 text-[#084734]" />
                        </div>
                        <h3 className="text-[22px] font-bold tracking-[-0.03em] text-[#111110]">
                            행사 신청이 접수되었습니다
                        </h3>
                        <p className="max-w-sm text-sm leading-6 text-[#617067]">
                            담당 매니저가 신청 내용을 확인한 뒤 일정과 참여 안내를 연락드릴게요.
                        </p>
                        <Button
                            onClick={() => handleOpenChange(false)}
                            variant="outline"
                            size="xl"
                            className="rounded-[18px] px-6"
                        >
                            닫기
                        </Button>
                    </div>
                ) : (
                    <>
                        <DialogHeader className="border-b border-[#E7ECE5] bg-[linear-gradient(180deg,#F6FBF7_0%,#FBFCF9_100%)] px-8 py-6">
                            <DialogTitle className="text-[24px] leading-[1.15] tracking-[-0.04em] text-[#111110]">
                                행사 신청
                            </DialogTitle>
                            <DialogDescription className="mt-2 text-[14px] leading-6 text-[#617067]">
                                {eventTitle}
                            </DialogDescription>
                        </DialogHeader>
                        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5 px-8 py-6">
                            {/* 스팸 봇 honeypot — 사용자에게 보이지 않으며 값이 채워지면 서버가 무시 */}
                            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
                                <label htmlFor="event-signup-website">Website</label>
                                <input id="event-signup-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                            </div>
                            <div className={`grid gap-4 rounded-[20px] p-5 ${marketingSurfaceClassName}`}>
                                <div className="grid gap-2">
                                    <FormLabel htmlFor="event-signup-name">담당자 이름</FormLabel>
                                    <Input id="event-signup-name" name="name" placeholder="홍길동" required aria-invalid={!!error} aria-describedby="event-signup-error" className={marketingFieldClassName} />
                                </div>
                                <div className="grid gap-2">
                                    <FormLabel htmlFor="event-signup-org">학원명 / 기관명</FormLabel>
                                    <Input id="event-signup-org" name="org" placeholder="예: 무궁화 학원" required aria-invalid={!!error} aria-describedby="event-signup-error" className={marketingFieldClassName} />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="event-signup-phone">연락처</FormLabel>
                                        <Input id="event-signup-phone" name="phone" type="tel" placeholder="010-1234-5678" required aria-invalid={!!error} aria-describedby="event-signup-error" className={marketingFieldClassName} />
                                    </div>
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="event-signup-email">이메일 (선택)</FormLabel>
                                        <Input id="event-signup-email" name="email" type="email" placeholder="name@classin.com" className={marketingFieldClassName} />
                                    </div>
                                </div>
                            </div>

                            <FormCheckbox
                                checked={marketingConsent}
                                onChange={(e) => setMarketingConsent(e.target.checked)}
                                label={<>행사·웨비나 소식을 이메일로 받아보겠습니다 <span className="text-[#6C776F]">(선택)</span></>}
                            />

                            <div className="space-y-3">
                                {error ? (
                                    <FormMessage id="event-signup-error" role="alert" aria-live="polite">
                                        {error}
                                    </FormMessage>
                                ) : (
                                    <FormHint>신청 후 담당자가 참여 안내와 사전 자료를 보내드립니다.</FormHint>
                                )}
                                <Button type="submit" disabled={loading} size="xl" className="h-12 w-full rounded-[18px] text-[15px] font-semibold">
                                    {loading ? (
                                        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />신청 접수 중</span>
                                    ) : (
                                        "신청하기"
                                    )}
                                </Button>
                            </div>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
