/**
 * LeadMagnetGate — 블로그 글 하단 자료 다운로드 게이트 블록
 *
 * 어드민이 글에 지정한 리드 마그넷(lib/lead-magnets.ts)을 본문 하단에 노출한다.
 * 이메일 입력 → /api/newsletter/subscribe (source: blog_lead_magnet:<slug>, leadMagnet 태그)
 * → /api/materials/[slug]/download 를 통해 자료 열람과 material_downloads 기록을 처리한다.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Download, FileText, Loader2, Mail } from "lucide-react"
import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { collectLeadAttribution } from "@/lib/marketing-attribution"
import type { LeadMagnet } from "@/lib/lead-magnets"
import {
  getLeadMagnetItemCount,
  getLeadMagnetPublicGateLabel,
  getLeadMagnetTierLabel,
} from "@/lib/lead-magnets-helpers"
import { MaterialDownloadError, requestMaterialDownload } from "@/lib/materials-client"

interface Props {
  leadMagnet: LeadMagnet
  /** 유입 추적용 — 어느 글에서 제출됐는지 기록 */
  postSlug: string
}

/**
 * 로그인 후 자료 다운로드 의도를 same-origin 상대 경로(next)에 실어 복원한다.
 * 현재 경로에 resume=download & material=<slug> 마커를 붙이되 기존 쿼리/해시는 보존한다.
 */
function buildResumeNextPath(slug: string): string {
  if (typeof window === "undefined") return `/resources/${slug}`
  const url = new URL(window.location.href)
  url.searchParams.set("resume", "download")
  url.searchParams.set("material", slug)
  return `${url.pathname}${url.search}${url.hash}`
}

export function LeadMagnetGate({ leadMagnet, postSlug }: Props) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [resumeNextPath, setResumeNextPath] = useState<string | undefined>(undefined)
  const resumedRef = useRef(false)

  const source = leadMagnet.sourceDetail
  const itemCount = getLeadMagnetItemCount(leadMagnet)
  const usesEmailGate = leadMagnet.gate === "email"

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
          attribution: collectLeadAttribution(),
        }),
      })
      const data = await res.json()

      if (res.ok && data.ok) {
        trackEvent("submit_newsletter", {
          source: "blog_lead_magnet",
          lead_magnet: leadMagnet.slug,
          post_slug: postSlug,
          gate: leadMagnet.gate,
          event_id: data.conversionEventId,
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

  const handleDownload = useCallback(async () => {
    if (downloading || !leadMagnet.published) return

    setDownloading(true)
    setError("")
    try {
      const result = await requestMaterialDownload({
        slug: leadMagnet.slug,
        email: submitted ? email : undefined,
        source: "blog_lead_magnet",
        postSlug,
      })
      window.location.assign(result.url)
    } catch (downloadError) {
      if (
        downloadError instanceof MaterialDownloadError &&
        downloadError.code === "login_required"
      ) {
        setResumeNextPath(buildResumeNextPath(leadMagnet.slug))
        setLoginDialogOpen(true)
      } else {
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : "자료를 열지 못했습니다."
        )
      }
    } finally {
      setDownloading(false)
    }
  }, [downloading, leadMagnet.published, leadMagnet.slug, submitted, email, postSlug])

  useEffect(() => {
    if (resumedRef.current) return
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    if (params.get("resume") !== "download") return
    if (params.get("material") !== leadMagnet.slug) return

    resumedRef.current = true

    params.delete("resume")
    params.delete("material")
    const cleanedSearch = params.toString()
    const cleanedUrl =
      window.location.pathname +
      (cleanedSearch ? `?${cleanedSearch}` : "") +
      window.location.hash
    window.history.replaceState(window.history.state, "", cleanedUrl)

    void handleDownload()
  }, [handleDownload, leadMagnet.slug])

  return (
    <section className="mt-10 border border-black/[0.08] bg-white md:mt-12">
      <PublicLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        nextPath={resumeNextPath}
        title="로그인 후 자료 받기"
      />
      <div className="h-1 w-full bg-[#084734]" />
      <div className="grid gap-7 p-6 md:grid-cols-[minmax(0,1fr)_360px] md:items-center md:gap-10 md:p-10">
        {/* 좌측: 자료 소개 + 체크리스트 미리보기 */}
        <div>
          <span className="inline-flex w-fit items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
            <FileText className="h-3.5 w-3.5" />
            {leadMagnet.ctaCopy.eyebrow} · {getLeadMagnetPublicGateLabel(leadMagnet.gate)}
          </span>
          <h2 className="mt-4 text-[1.55rem] font-bold leading-snug tracking-[-0.03em] text-[#111110] md:text-[1.9rem]">
            {leadMagnet.ctaCopy.title}
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-[#1a1a1a]/65">
            {leadMagnet.summary}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-[#615D59]">
            <span>{itemCount}문항</span>
            <span>약 {leadMagnet.estimatedMinutes}분</span>
            <span>{leadMagnet.formatLabel}</span>
          </div>

          <ul className="mt-5 grid gap-2.5">
            {leadMagnet.deliverables.slice(0, 4).map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[14px] leading-6 text-[#1a1a1a]/75">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12px] font-semibold text-[#084734]/70">
            {getLeadMagnetTierLabel(leadMagnet.tier)} 자료 · {getLeadMagnetPublicGateLabel(leadMagnet.gate)}
          </p>
        </div>

        {/* 우측: 이메일 폼 / 완료 상태 */}
        <div className="border border-black/[0.08] bg-[#FAFAF8] p-5 md:p-6">
          {submitted || !usesEmailGate ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center border border-black/[0.08] bg-white">
                <CheckCircle2 className="h-7 w-7 text-[#084734]" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-[#111110]">
                  {submitted ? "신청이 완료되었습니다!" : getLeadMagnetPublicGateLabel(leadMagnet.gate)}
                </p>
                <p className="text-sm leading-6 text-[#1a1a1a]/55">
                  {leadMagnet.published
                    ? "아래 버튼을 눌러 자료를 바로 확인하세요."
                    : "자료 공개 준비가 끝나면 이메일로 안내드릴게요."}
                </p>
              </div>
              <Button
                type="button"
                disabled={!leadMagnet.published || downloading}
                onClick={() => void handleDownload()}
                className="h-11 w-full rounded-[6px] bg-[#084734] font-semibold text-white hover:bg-[#065c41]"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                자료 받기
              </Button>
              {error && <p className="text-sm text-[#B85C33]">{error}</p>}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-sm font-semibold text-[#111110]">
                PDF로 자료 받기
              </p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일을 입력해주세요"
                  required
                  className="h-11 rounded-[6px] border-black/[0.08] pl-10 focus-visible:border-[#084734]/50 focus-visible:ring-[#084734]/10"
                />
              </div>

              {error && <p className="text-sm text-[#B85C33]">{error}</p>}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-[6px] bg-[#084734] font-semibold text-white hover:bg-[#065c41]"
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
