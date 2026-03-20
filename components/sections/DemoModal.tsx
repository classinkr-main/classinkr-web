"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2 } from "lucide-react"
import { submitLead } from "@/lib/submitLead"
import { trackEvent } from "@/lib/analytics"

export function DemoModal({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    // SSR hydration mismatch is handled by modern Radix natively when setup correctly,
    // avoiding conditional rendering prevents the 'trigger not working' bug.
    useEffect(() => { setMounted(true) }, [])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const form = e.currentTarget
        const formData = new FormData(form)

        try {
            await submitLead({
                source: "demo_modal",
                name: formData.get("name") as string,
                org: formData.get("org") as string,
                role: formData.get("role") as string,
                size: formData.get("size") as string,
                email: formData.get("email") as string,
                phone: formData.get("phone") as string,
            })
            trackEvent("submit_demo_request", { source: "demo_modal" })
            setSubmitted(true)
        } catch {
            setError("제출에 실패했습니다. 다시 시도해주세요.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] bg-slate-900 border border-white/10 text-white shadow-2xl">
                {submitted ? (
                    <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center bg-transparent rounded-lg">
                        <CheckCircle2 className="h-12 w-12 text-green-400" />
                        <h3 className="text-xl font-semibold text-white">신청이 접수되었습니다!</h3>
                        <p className="text-slate-300">
                            15분 내로 맞춤형 도입 플랜과 함께 연락드리겠습니다.
                        </p>
                        <Button onClick={() => setSubmitted(false)} variant="outline" className="text-slate-950">
                            닫기
                        </Button>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-white">맞춤형 데모 예약하기</DialogTitle>
                            <DialogDescription className="text-slate-300">
                                LMS와 분석 플랫폼을 직접 경험해보세요. 운영 품질을 표준화하는 방법을 안내해 드립니다.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name" className="text-slate-200">이름</Label>
                                <Input id="name" name="name" placeholder="홍길동" required className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="org" className="text-slate-200">학원명</Label>
                                <Input id="org" name="org" placeholder="클래스인 아카데미" required className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="role" className="text-slate-200">직책</Label>
                                    <Input id="role" name="role" placeholder="원장 / 관리자" required className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="size" className="text-slate-200">원생 수</Label>
                                    <Input id="size" name="size" placeholder="예: 500+" required className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email" className="text-slate-200">이메일</Label>
                                <Input id="email" name="email" type="email" placeholder="email@example.com" required className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="phone" className="text-slate-200">전화번호</Label>
                                <Input id="phone" name="phone" type="tel" placeholder="010-1234-5678" required className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                            </div>
                            {error && (
                                <p className="text-red-400 text-sm text-center">{error}</p>
                            )}
                            <Button type="submit" disabled={loading} className="w-full mt-2 bg-primary hover:bg-primary/90 text-white">
                                {loading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />제출 중...</>
                                ) : (
                                    "데모 신청하기"
                                )}
                            </Button>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
