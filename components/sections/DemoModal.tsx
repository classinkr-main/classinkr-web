"use client"

import React, { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2 } from "lucide-react"
import { submitLead } from "@/lib/submitLead"
import { trackEvent } from "@/lib/analytics"
import { useToast } from "@/components/ui/toast"

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
            trackEvent('click_cta', { button: trackingButton })
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
            const data = await submitLead({
                source: "demo_modal",
                name: formData.get("name") as string,
                org: formData.get("org") as string,
                role: formData.get("role") as string,
                size: formData.get("size") as string,
                email: formData.get("email") as string,
                phone: formData.get("phone") as string,
                marketingConsent,
            })
            setWarning(Array.isArray(data.warnings) && data.warnings.length > 0
                ? "리드는 접수되었지만 일부 외부 연동은 지연되었습니다. 내부 시스템에는 정상 등록되었습니다."
                : "")
            trackEvent("submit_demo_request", { source: "demo_modal" })
            toast.success("문의가 접수되었어요")
            setSubmitted(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "제출에 실패했습니다. 다시 시도해주세요."
            setError(msg)
            setShake(true)
            setTimeout(() => setShake(false), 200)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] bg-slate-900 border border-white/10 text-white shadow-2xl">
                {submitted ? (
                    <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center bg-transparent rounded-lg">
                        <CheckCircle2 className="h-12 w-12 text-green-400" />
                        <h3 className="text-xl font-semibold text-white">데모 신청이 접수되었습니다!</h3>
                        <p className="text-slate-300">
                            {warning || "15분 내로 맞춤형 도입 플랜과 함께 연락드리겠습니다."}
                        </p>
                        <Button onClick={() => handleOpenChange(false)} variant="outline" className="text-slate-950">
                            닫기
                        </Button>
                    </div>
                ) : (
                    <React.Fragment>
                        <DialogHeader>
                            <DialogTitle className="text-white">맞춤형 데모 신청하기</DialogTitle>
                            <DialogDescription className="text-slate-300">
                                LMS와 분석 플랫폼을 직접 경험해보세요. 운영 품질을 표준화하는 방법을 안내해 드립니다.
                            </DialogDescription>
                        </DialogHeader>
                        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name" className="text-slate-200">이름</Label>
                                <Input id="name" name="name" placeholder="홍길동" required aria-invalid={!!error} aria-describedby="demo-name-error" className={`bg-white/5 border-white/10 text-white placeholder:text-slate-500${shake ? " animate-shake" : ""}`} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="org" className="text-slate-200">학원명</Label>
                                <Input id="org" name="org" placeholder="클래스인 아카데미" required aria-invalid={!!error} aria-describedby="demo-org-error" className={`bg-white/5 border-white/10 text-white placeholder:text-slate-500${shake ? " animate-shake" : ""}`} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="role" className="text-slate-200">직책</Label>
                                    <Input id="role" name="role" placeholder="원장 / 관리자" required aria-invalid={!!error} aria-describedby="demo-role-error" className={`bg-white/5 border-white/10 text-white placeholder:text-slate-500${shake ? " animate-shake" : ""}`} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="size" className="text-slate-200">원생 수</Label>
                                    <Input id="size" name="size" placeholder="예: 500+" required aria-invalid={!!error} aria-describedby="demo-size-error" className={`bg-white/5 border-white/10 text-white placeholder:text-slate-500${shake ? " animate-shake" : ""}`} />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email" className="text-slate-200">이메일</Label>
                                <Input id="email" name="email" type="email" placeholder="email@example.com" required aria-invalid={!!error} aria-describedby="demo-email-error" className={`bg-white/5 border-white/10 text-white placeholder:text-slate-500${shake ? " animate-shake" : ""}`} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="phone" className="text-slate-200">전화번호</Label>
                                <Input id="phone" name="phone" type="tel" placeholder="010-1234-5678" required aria-invalid={!!error} aria-describedby="demo-phone-error" className={`bg-white/5 border-white/10 text-white placeholder:text-slate-500${shake ? " animate-shake" : ""}`} />
                            </div>
                            <label className="flex items-start gap-2.5 cursor-pointer group">
                                <div className="relative mt-0.5 shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={marketingConsent}
                                        onChange={(e) => setMarketingConsent(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-4 h-4 rounded border transition-all ${
                                        marketingConsent
                                            ? "bg-[#084734] border-[#084734]"
                                            : "bg-white/10 border-white/20 group-hover:border-white/40"
                                    }`}>
                                        {marketingConsent && (
                                            <svg className="w-4 h-4 text-white p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[12px] text-slate-400 leading-relaxed">
                                    클래스인의 제품 소식 및 마케팅 이메일 수신에 동의합니다.{" "}
                                    <span className="text-slate-500">(선택)</span>
                                </span>
                            </label>
                            {error && (
                                <p id="demo-name-error" role="alert" aria-live="polite" className="text-[#B85C33] text-sm text-center">{error}</p>
                            )}
                            <Button type="submit" disabled={loading} className="w-full mt-2 bg-primary hover:bg-primary/90 text-white">
                                {loading ? (
                                    <span className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />제출 중...</span>
                                ) : (
                                    "데모 신청하기"
                                )}
                            </Button>
                        </form>
                    </React.Fragment>
                )}
            </DialogContent>
        </Dialog>
    )
}
