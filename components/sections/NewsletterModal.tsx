/**
 * NewsletterModal — 이메일 구독 모달
 *
 * Dialog 래퍼로 NewsletterSubscribe 폼을 띄움.
 * - source prop으로 유입 경로 추적 (gnb_materials, finalcta_download 등)
 * - onSuccess prop으로 구독 완료 후 콜백 처리 (소개서 다운로드 등)
 */

"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, Mail } from "lucide-react"

interface Props {
  children: React.ReactNode
  /** 구독 유입 경로 — DB source 필드에 저장 */
  source?: string
  /** 모달 제목 */
  title?: string
  /** 모달 설명 */
  description?: string
  /** 구독 완료 후 콜백 (ex. 소개서 링크 오픈) */
  onSuccess?: () => void
}

export function NewsletterModal({
  children,
  source = "newsletter",
  title = "최신 교육 인사이트 받아보기",
  description = "Classin의 교육 트렌드, 제품 업데이트, 행사 정보를 이메일로 받아보세요.",
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        setSubmitted(true)
        onSuccess?.()
      } else {
        setError(data.error || "구독에 실패했습니다.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // 닫을 때 상태 초기화
      setTimeout(() => {
        setEmail("")
        setSubmitted(false)
        setError("")
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <span onClick={() => setOpen(true)} className="contents">
        {children}
      </span>

      <DialogContent className="sm:max-w-[440px] bg-white border border-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#111110]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-[#084734]" />
            <p className="font-semibold text-[#111110]">구독이 완료되었습니다!</p>
            <p className="text-sm text-slate-500">소식을 기대해주세요.</p>
            <Button
              className="mt-2 bg-[#084734] hover:bg-[#084734]/90 text-white"
              onClick={() => handleOpenChange(false)}
            >
              닫기
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력해주세요"
                required
                className="pl-10 border-slate-200 focus-visible:ring-[#084734]/30"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#084734] hover:bg-[#084734]/90 text-white font-semibold h-11"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "무료 구독하기"
              )}
            </Button>

            <p className="text-[10px] text-slate-400 leading-relaxed text-center">
              구독 시 Classin의 교육 인사이트, 제품 업데이트, 행사 안내를 이메일로
              받아보는 것에 동의합니다. 언제든지 수신거부할 수 있습니다.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
