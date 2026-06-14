/**
 * LeadMagnetGate — 블로그 글 하단 자료 다운로드 게이트 블록
 *
 * 어드민이 글에 지정한 리드 마그넷(lib/lead-magnets.ts)을 본문 하단에 노출한다.
 * 이메일 입력 → /api/newsletter/subscribe (source: blog_lead_magnet:<slug>, leadMagnet 태그)
 * → 구독자 DB에 마그넷 태그가 남고, resourceUrl이 있으면 즉시 열람 버튼을 띄운다.
 */

"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Download, Loader2, Mail, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import type { LeadMagnet } from "@/lib/lead-magnets"

interface Props {
  leadMagnet: LeadMagnet
  /** 유입 추적용 — 어느 글에서 제출됐는지 기록 */
  postSlug: string
}

export function LeadMagnetGate({ leadMagnet, postSlug }: Props) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const source = `blog_lead_magnet:${leadMagnet.slug}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || loading) return

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          leadMagnet: leadMagnet.slug,
        }),
      })
      const data = await res.json()

      if (res.ok && data.ok) {
        trackEvent("submit_newsletter", {
          source: "blog_lead_magnet",
          lead_magnet: leadMagnet.slug,
          post_slug: postSlug,
        })
        setSubmitted(true)
      } else {
        setError(data.error || "신청에 실패했습니다. 잠시 후 다시 시도해주세요.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mt-10 overflow-hidden rounded-[24px] border border-[#dcebd9] bg-[#ECFDF5] shadow-sm md:mt-12 md:rounded-[32px]">
      <div className="h-1 w-full bg-gradient-to-r from-[#084734] via-[#6EE7B7] to-[#084734]" />
      <div className="grid gap-7 p-6 md:grid-cols-[minmax(0,1fr)_360px] md:items-center md:gap-10 md:p-10">
        {/* 좌측: 자료 소개 + 체크리스트 미리보기 */}
        <div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#084734]/10 bg-white px-3.5 py-1 text-[11px] font-bold tracking-[0.04em] text-[#084734]">
            <Sparkles className="h-3 w-3" />
            {leadMagnet.ctaCopy.eyebrow}
          </span>
          <h2 className="mt-4 text-[1.55rem] font-semibold leading-snug tracking-[-0.03em] text-[#111110] md:text-[1.9rem]">
            {leadMagnet.ctaCopy.title}
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-[#1a1a1a]/65">
            {leadMagnet.ctaCopy.body}
          </p>

          <ul className="mt-5 grid gap-2.5">
            {leadMagnet.checklistBullets.slice(0, 4).map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-[14px] leading-6 text-[#1a1a1a]/75">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        {/* 우측: 이메일 폼 / 완료 상태 */}
        <div className="rounded-[20px] border border-black/[0.06] bg-white p-5 shadow-sm md:p-6">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5]">
                <CheckCircle2 className="h-7 w-7 text-[#084734]" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-[#111110]">신청이 완료되었습니다!</p>
                <p className="text-sm leading-6 text-[#1a1a1a]/55">
                  {leadMagnet.resourceUrl
                    ? "아래 버튼을 눌러 자료를 바로 확인하세요."
                    : "입력하신 이메일로 자료를 보내드릴게요."}
                </p>
              </div>
              {leadMagnet.resourceUrl && (
                <Button
                  asChild
                  className="h-11 w-full bg-[#084734] font-semibold text-white hover:bg-[#065c41]"
                >
                  <a
                    href={leadMagnet.resourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent("download_materials", {
                        source: "blog_lead_magnet",
                        lead_magnet: leadMagnet.slug,
                        post_slug: postSlug,
                      })
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    자료 받기
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-sm font-semibold text-[#111110]">
                이메일로 자료를 받아보세요
              </p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일을 입력해주세요"
                  required
                  className="h-11 border-black/[0.08] pl-10 focus-visible:border-[#084734]/50 focus-visible:ring-[#084734]/10"
                />
              </div>

              {error && <p className="text-sm text-[#B85C33]">{error}</p>}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full bg-[#084734] font-semibold text-white hover:bg-[#065c41]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {leadMagnet.ctaCopy.buttonLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-[10px] leading-relaxed text-[#A39E98]">
                자료 신청 시 Classin의 교육 인사이트·제품 소식을 이메일로 받아보는 것에
                동의합니다. 언제든 수신거부할 수 있습니다.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
