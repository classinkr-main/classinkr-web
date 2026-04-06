/**
 * NewsletterModal — 이메일 구독 모달
 *
 * - variant="light" (기본): GNB, 일반 섹션용 흰 배경 모달
 * - variant="dark": FinalCTA 등 다크 섹션용 다크 모달
 * - successCta: 구독 완료 후 보여줄 링크 버튼 (소개서 다운로드 등)
 * - source: DB 저장용 유입 경로 추적
 */

"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, Mail, ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  children: React.ReactNode
  /** 구독 유입 경로 — DB source 필드에 저장 */
  source?: string
  /** 모달 색상 테마 */
  variant?: "light" | "dark"
  /** 모달 제목 */
  title?: string
  /** 모달 설명 */
  description?: string
  /** 모달 상단 배지 텍스트 */
  badge?: string
  /** 폼 하단 혜택 문구 목록 */
  benefits?: string[]
  /** 구독 완료 후 표시할 CTA 버튼 */
  successCta?: {
    label: string
    href: string
  }
}

export function NewsletterModal({
  children,
  source = "newsletter",
  variant = "light",
  title = "최신 교육 인사이트 받아보기",
  description = "Classin의 교육 트렌드, 제품 업데이트, 행사 정보를 이메일로 받아보세요.",
  badge,
  benefits,
  successCta,
}: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const isDark = variant === "dark"

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
      setTimeout(() => {
        setEmail("")
        setSubmitted(false)
        setError("")
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent
        className={cn(
          "sm:max-w-[460px] shadow-2xl border p-0 overflow-hidden",
          isDark
            ? "bg-slate-900 border-white/10 text-white"
            : "bg-white border-slate-200 text-[#111110]"
        )}
      >
        {/* 상단 액센트 바 */}
        <div className="h-1 w-full bg-gradient-to-r from-[#084734] via-emerald-500 to-[#084734]" />

        <div className="px-6 pb-6 pt-5">
          <DialogHeader className="space-y-2 mb-5">
            {badge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full w-fit mb-1",
                  isDark
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-[#084734]/8 text-[#084734] border border-[#084734]/15"
                )}
              >
                <Sparkles className="w-3 h-3" />
                {badge}
              </span>
            )}
            <DialogTitle
              className={cn(
                "text-xl font-bold leading-snug",
                isDark ? "text-white" : "text-[#111110]"
              )}
            >
              {title}
            </DialogTitle>
            <DialogDescription
              className={cn(
                "text-sm leading-relaxed",
                isDark ? "text-slate-400" : "text-slate-500"
              )}
            >
              {description}
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <SuccessState
              isDark={isDark}
              successCta={successCta}
              onClose={() => handleOpenChange(false)}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Mail
                  className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                    isDark ? "text-slate-500" : "text-slate-400"
                  )}
                />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일을 입력해주세요"
                  required
                  className={cn(
                    "pl-10 h-11 transition-all",
                    isDark
                      ? "bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                      : "border-slate-200 focus-visible:border-[#084734]/40 focus-visible:ring-[#084734]/10"
                  )}
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              {benefits && benefits.length > 0 && (
                <ul className="space-y-1.5 py-1">
                  {benefits.map((b) => (
                    <li
                      key={b}
                      className={cn(
                        "flex items-center gap-2 text-xs",
                        isDark ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="submit"
                disabled={loading}
                className={cn(
                  "w-full h-11 font-semibold transition-all",
                  isDark
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-[#084734] hover:bg-[#084734]/90 text-white"
                )}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  successCta ? "이메일로 받아보기" : "무료 구독하기"
                )}
              </Button>

              <p
                className={cn(
                  "text-[10px] leading-relaxed text-center",
                  isDark ? "text-slate-600" : "text-slate-400"
                )}
              >
                구독 시 Classin의 교육 인사이트, 제품 업데이트, 행사 안내를 이메일로
                받아보는 것에 동의합니다. 언제든지 수신거부할 수 있습니다.
              </p>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── 구독 완료 상태 ─────────────────────────────────────── */

function SuccessState({
  isDark,
  successCta,
  onClose,
}: {
  isDark: boolean
  successCta?: { label: string; href: string }
  onClose: () => void
}) {
  return (
    <div className="py-4 flex flex-col items-center gap-4 text-center">
      <div
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center",
          isDark ? "bg-emerald-500/15" : "bg-[#084734]/8"
        )}
      >
        <CheckCircle2
          className={cn(
            "w-7 h-7",
            isDark ? "text-emerald-400" : "text-[#084734]"
          )}
        />
      </div>

      <div className="space-y-1">
        <p className={cn("font-bold text-lg", isDark ? "text-white" : "text-[#111110]")}>
          구독이 완료되었습니다!
        </p>
        <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
          {successCta
            ? "아래 버튼을 눌러 바로 확인하세요."
            : "앞으로 유용한 소식을 보내드릴게요."}
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full pt-1">
        {successCta && (
          <Button
            asChild
            className={cn(
              "w-full h-11 font-semibold",
              isDark
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-[#084734] hover:bg-[#084734]/90 text-white"
            )}
          >
            <a href={successCta.href} target="_blank" rel="noopener noreferrer">
              {successCta.label}
              <ArrowRight className="ml-2 w-4 h-4" />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          className={cn(
            "w-full h-9 text-sm",
            isDark
              ? "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              : "text-slate-400 hover:text-slate-600"
          )}
          onClick={onClose}
        >
          닫기
        </Button>
      </div>
    </div>
  )
}
