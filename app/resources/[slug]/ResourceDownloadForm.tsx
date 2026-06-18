"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackEvent } from "@/lib/analytics"
import { MaterialDownloadError, requestMaterialDownload } from "@/lib/materials-client"
import { cn } from "@/lib/utils"

interface ResourceDownloadFormProps {
  resource: {
    slug: string
    title: string
    gate: "open" | "email" | "login"
    estimatedMinutes: number
    itemCount: number
    hasPdfFile: boolean
  }
}

interface DownloadFormState {
  name: string
  org: string
  role: string
  size: string
  email: string
  phone: string
  website: string
  consent: boolean
}

const initialForm: DownloadFormState = {
  name: "",
  org: "",
  role: "",
  size: "",
  email: "",
  phone: "",
  website: "",
  consent: true,
}

const inputClassName =
  "h-10 rounded-[6px] border-black/[0.08] bg-white text-[14px] focus-visible:border-[#084734]/50 focus-visible:ring-[#084734]/10"

export function ResourceDownloadForm({ resource }: ResourceDownloadFormProps) {
  const [form, setForm] = useState<DownloadFormState>(initialForm)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const updateField = <Key extends keyof DownloadFormState>(
    key: Key,
    value: DownloadFormState[Key]
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const scrollToChecklist = () => {
    document.getElementById("resource-checklist")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    const email = form.email.trim().toLowerCase()
    if (!email || !form.name.trim() || !form.org.trim() || !form.consent) {
      setError("필수 정보를 입력하고 수신 동의에 체크해 주세요.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const leadResponse = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "newsletter",
          sourceDetail: `resource_pdf_download:${resource.slug}`,
          leadMagnet: resource.slug,
          name: form.name.trim(),
          org: form.org.trim(),
          role: form.role.trim(),
          size: form.size.trim(),
          email,
          phone: form.phone.trim(),
          message: `PDF 자료 요청: ${resource.title}`,
          marketingConsent: true,
          currentPage: window.location.href,
          landingPage: window.location.origin + window.location.pathname,
          referrer: document.referrer,
          website: form.website,
        }),
      })
      const leadData = await leadResponse.json().catch(() => null)

      if (!leadResponse.ok || !leadData?.ok) {
        setError(leadData?.error || "자료 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }

      trackEvent("submit_newsletter", {
        source: "resource_pdf_download",
        lead_magnet: resource.slug,
        gate: resource.gate,
      })

      const result = await requestMaterialDownload({
        slug: resource.slug,
        email,
        source: "resource_pdf_download",
      })

      const destination = new URL(result.url, window.location.origin)
      const isCurrentPage = destination.pathname === window.location.pathname

      if (!isCurrentPage) {
        window.location.assign(result.url)
        return
      }

      setSubmitted(true)
    } catch (downloadError) {
      if (downloadError instanceof MaterialDownloadError) {
        setError(downloadError.message)
      } else {
        setError("자료 다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="download" className="scroll-mt-28">
      <aside className="border border-black/[0.08] bg-white p-5 shadow-[0_10px_28px_rgba(17,17,16,0.04)] lg:sticky lg:top-28">
      {submitted ? (
        <div className="flex min-h-[360px] flex-col justify-center text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center border border-black/[0.08] bg-white text-[#084734]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-[#111110]">자료 신청이 완료되었습니다.</h2>
          <p className="mt-3 text-sm leading-6 text-[#615D59]">
            다운로드가 시작되지 않았다면 아래 문항을 먼저 확인한 뒤 다시 시도해 주세요.
          </p>
          <Button type="button" className="mt-6 h-11 w-full" onClick={scrollToChecklist}>
            전체 문항 보기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
              {resource.hasPdfFile ? "PDF Download" : "PDF Request"}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
              업무용 이메일로 자료 받기
            </h2>
            <p className="mt-3 pr-16 text-sm leading-6 text-[#615D59] sm:pr-0">
              PDF에는 관련 자료와 상담 링크가 포함됩니다. 다운로드와 관련 소식 안내에 필요한
              최소 정보만 받습니다.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-y border-black/[0.08] py-4 text-center">
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">형식</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">PDF</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">분량</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">
                {resource.itemCount}문항
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">소요</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">
                약 {resource.estimatedMinutes}분
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <input
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
              name="website"
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  이름 *
                </span>
                <Input
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className={inputClassName}
                  placeholder="홍길동"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  이메일 *
                </span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    className={cn(inputClassName, "pl-10")}
                    placeholder="name@classin.com"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  학원명 *
                </span>
                <Input
                  value={form.org}
                  onChange={(event) => updateField("org", event.target.value)}
                  className={inputClassName}
                  placeholder="클래스인학원"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  직책
                </span>
                <Input
                  value={form.role}
                  onChange={(event) => updateField("role", event.target.value)}
                  className={inputClassName}
                  placeholder="원장 / 실장 / 강사"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  원생 규모
                </span>
                <select
                  value={form.size}
                  onChange={(event) => updateField("size", event.target.value)}
                  className={cn(inputClassName, "w-full px-3")}
                >
                  <option value="">선택</option>
                  <option value="100명 이하">100명 이하</option>
                  <option value="100~300명">100~300명</option>
                  <option value="300~500명">300~500명</option>
                  <option value="500명 이상">500명 이상</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  연락처
                </span>
                <Input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className={inputClassName}
                  placeholder="010-0000-0000"
                />
              </label>
            </div>

            <label className="flex gap-2 border border-black/[0.08] bg-[#F6F5F4] p-3 text-[12px] leading-5 text-[#615D59]">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(event) => updateField("consent", event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#084734]"
                required
              />
              <span>
                자료 제공과 Classin 교육 인사이트·제품 소식 수신에 동의합니다. 언제든 수신거부할
                수 있습니다.
              </span>
            </label>

            {error ? <p className="text-sm leading-6 text-[#B85C33]">{error}</p> : null}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {resource.hasPdfFile ? "PDF 다운로드" : "PDF 자료 신청하기"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </>
      )}
      </aside>
    </div>
  )
}
