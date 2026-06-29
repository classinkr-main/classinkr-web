"use client"

import React, { useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2, Sparkles } from "lucide-react"

import { trackEvent } from "@/lib/analytics"
import { submitLead } from "@/lib/submitLead"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
    FormCheckbox,
    FormHint,
    FormLabel,
    FormMessage,
    marketingFieldClassName,
    marketingSurfaceClassName,
} from "@/components/ui/marketing-form"
import { Input } from "@/components/ui/input"

export function DemoModal({ children, trackingButton }: { children: React.ReactNode; trackingButton?: string }) {
    const [open, setOpen] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [warning, setWarning] = useState("")
    const [shake, setShake] = useState(false)
    const [marketingConsent, setMarketingConsent] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const toast = useToast()

    const resetFormState = () => {
        setSubmitted(false)
        setLoading(false)
        setError("")
        setWarning("")
        setMarketingConsent(false)
        formRef.current?.reset()
    }

    useEffect(() => {
        return () => {
            if (resetTimerRef.current) {
                clearTimeout(resetTimerRef.current)
            }
        }
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (resetTimerRef.current) {
            clearTimeout(resetTimerRef.current)
            resetTimerRef.current = null
        }
        if (nextOpen && trackingButton) {
            trackEvent("click_cta", { button: trackingButton })
        }
        if (!nextOpen) {
            resetTimerRef.current = setTimeout(() => {
                resetFormState()
                resetTimerRef.current = null
            }, 250)
        }
        setOpen(nextOpen)
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const form = e.currentTarget
        const formData = new FormData(form)

        try {
            const goal = formData.get("goal") as string
            const timeline = formData.get("timeline") as string
            const message = [
                goal ? `상담 목표: ${goal}` : undefined,
                timeline ? `희망 시점: ${timeline}` : undefined,
            ]
                .filter(Boolean)
                .join("\n")

            const data = await submitLead({
                source: "demo_modal",
                sourceDetail: trackingButton,
                name: formData.get("name") as string,
                org: formData.get("org") as string,
                role: formData.get("role") as string,
                size: formData.get("size") as string,
                email: formData.get("email") as string,
                phone: formData.get("phone") as string,
                message: message || undefined,
                marketingConsent,
                website: (formData.get("website") as string) || undefined,
            })
            setWarning(
                Array.isArray(data.warnings) && data.warnings.length > 0
                    ? "상담 요청은 접수되었지만 일부 알림 연동이 지연 중입니다. 내부 기록은 저장되었고 담당자가 확인합니다."
                    : ""
            )
            trackEvent("submit_demo_request", {
                source: "demo_modal",
                lead_id: data.leadId,
                stored: data.stored,
                event_id: data.conversionEventId,
            })
            toast.success("상담 요청이 접수되었어요")
            setSubmitted(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "상담 요청을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요."
            setError(msg)
            setShake(true)
            setTimeout(() => setShake(false), 200)
        } finally {
            setLoading(false)
        }
    }

    const fieldClassName = `${marketingFieldClassName}${shake ? " animate-shake" : ""}`

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[560px] overflow-hidden border-[#E4E8E2] bg-[#FBFCF9] p-0">
                {submitted ? (
                    <div className="flex flex-col items-center justify-center space-y-4 px-8 py-12 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5]">
                            <CheckCircle2 className="h-7 w-7 text-[#084734]" />
                        </div>
                        <h3 className="text-[24px] font-bold tracking-[-0.03em] text-[#111110]">
                            상담 요청이 접수되었습니다
                        </h3>
                        <p className="max-w-sm text-sm leading-6 text-[#617067]">
                            {warning || "담당 매니저가 남겨주신 운영 상황을 먼저 확인한 뒤, 필요한 자료와 다음 상담 순서를 안내드릴게요."}
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
                        <DialogHeader className="border-b border-[#E7ECE5] bg-[linear-gradient(180deg,#F6FBF7_0%,#FBFCF9_100%)] px-8 py-7">
                            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#DCE9E1] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0E7A49]">
                                <Sparkles className="h-3.5 w-3.5" />
                                Consultation
                            </div>
                            <DialogTitle className="text-[28px] leading-[1.1] tracking-[-0.04em] text-[#111110]">
                                운영에 맞는 상담 흐름을 바로 잡아드립니다
                            </DialogTitle>
                            <DialogDescription className="mt-2 max-w-lg text-[15px] leading-7 text-[#617067]">
                                기관 규모, 현재 고민, 희망 도입 시점을 남겨주시면 제품 소개보다 더 실무적인 순서로 안내드릴게요.
                            </DialogDescription>
                        </DialogHeader>
                        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5 px-8 py-7">
                            {/* 스팸 봇 honeypot — 사용자에게 보이지 않으며 값이 채워지면 서버가 무시 */}
                            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
                                <label htmlFor="demo-website">Website</label>
                                <input id="demo-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                            </div>
                            <div className={`grid gap-5 rounded-[24px] p-5 ${marketingSurfaceClassName}`}>
                                <div className="grid gap-5 md:grid-cols-2">
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="name">담당자 이름</FormLabel>
                                        <Input id="name" name="name" placeholder="홍길동" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="org">학원명 / 기관명</FormLabel>
                                        <Input id="org" name="org" placeholder="예: 무궁화 학원" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                </div>
                                <div className="grid gap-5 md:grid-cols-2">
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="role">직함</FormLabel>
                                        <Input id="role" name="role" placeholder="원장 / 운영 매니저" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="size">운영 규모</FormLabel>
                                        <Input id="size" name="size" placeholder="예: 학생 300명 / 강사 20명" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                </div>
                                <div className="grid gap-5 md:grid-cols-2">
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="email">이메일</FormLabel>
                                        <Input id="email" name="email" type="email" placeholder="name@classin.com" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="phone">연락처</FormLabel>
                                        <Input id="phone" name="phone" type="tel" placeholder="010-1234-5678" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                </div>
                                <div className="grid gap-5 md:grid-cols-2">
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="goal">상담 우선순위</FormLabel>
                                        <Input id="goal" name="goal" placeholder="예: 출결 관리, 온라인 수업 전환, 하드웨어 견적" required aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                    <div className="grid gap-2">
                                        <FormLabel htmlFor="timeline">희망 시점</FormLabel>
                                        <Input id="timeline" name="timeline" placeholder="예: 2주 내 상담 / 여름학기 전 도입" aria-invalid={!!error} aria-describedby="demo-error" className={fieldClassName} />
                                    </div>
                                </div>
                            </div>

                            <FormCheckbox
                                checked={marketingConsent}
                                onChange={(e) => setMarketingConsent(e.target.checked)}
                                label={<>제품 업데이트와 교육 운영 인사이트를 이메일로 받아보겠습니다 <span className="text-[#6C776F]">(선택)</span></>}
                                description="상담 일정 안내와 별도로 신규 기능, 웨비나, 운영 사례를 받아볼 수 있습니다."
                            />

                            <div className="space-y-3">
                                {error ? (
                                    <FormMessage id="demo-error" role="alert" aria-live="polite">
                                        {error}
                                    </FormMessage>
                                ) : (
                                    <FormHint>
                                        제출 후 담당자가 운영 목적, 규모, 희망 시점을 확인해 가장 적합한 상담 흐름으로 연락드립니다.
                                    </FormHint>
                                )}
                                <Button type="submit" disabled={loading} size="xl" className="h-12 w-full rounded-[18px] text-[15px] font-semibold">
                                    {loading ? (
                                        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />상담 요청 접수 중</span>
                                    ) : (
                                        "상담 요청하기"
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
