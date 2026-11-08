"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, CheckCircle2, Download, Loader2, LockKeyhole, Mail, RotateCcw } from "lucide-react"

import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackEvent } from "@/lib/analytics"
import { getAnonymousId } from "@/lib/consent/consent"
import { ACADEMY_SIZE_OPTIONS } from "@/lib/contact/academy-size"
import { collectLeadAttribution } from "@/lib/marketing-attribution"
import {
  canReuseForLeadRequest,
  forgetRememberedMaterialAccess,
  hasUnlockedMaterial,
  maskEmail,
  rememberMaterialAccess,
  useRememberedMaterialAccess,
} from "@/lib/material-access-memory"
import {
  MaterialDownloadError,
  deliverMaterialDownload,
  requestMaterialDownload,
} from "@/lib/materials-client"
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
  privacyConsent: boolean
  marketingConsent: boolean
}

/** downloaded: 파일을 그 자리에서 내려받기 시작 · requested: 파일 없이 신청만 접수(같은 페이지) */
type Completion = "downloaded" | "requested"

const initialForm: DownloadFormState = {
  name: "",
  org: "",
  role: "",
  size: "",
  email: "",
  phone: "",
  website: "",
  privacyConsent: false,
  marketingConsent: false,
}

const inputClassName =
  "h-10 rounded-[6px] border-black/[0.08] bg-white text-[14px]"

class LeadRequestError extends Error {}

function ResourceStats({ itemCount, estimatedMinutes }: { itemCount: number; estimatedMinutes: number }) {
  return (
    <div className="mt-5 grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-[8px] border border-black/[0.08] bg-black/[0.08] text-center">
      <div className="bg-white px-2 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A39E98]">형식</p>
        <p className="mt-1 text-[13px] font-bold text-[#31302E]">PDF</p>
      </div>
      <div className="bg-white px-2 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A39E98]">분량</p>
        <p className="mt-1 text-[13px] font-bold text-[#31302E]">{itemCount}문항</p>
      </div>
      <div className="bg-white px-2 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A39E98]">소요</p>
        <p className="mt-1 text-[13px] font-bold text-[#31302E]">약 {estimatedMinutes}분</p>
      </div>
    </div>
  )
}

export function ResourceDownloadForm({ resource }: ResourceDownloadFormProps) {
  const [form, setForm] = useState<DownloadFormState>(initialForm)
  const [loading, setLoading] = useState(false)
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [downloadEmail, setDownloadEmail] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const resumedRef = useRef(false)

  // 이 기기에서 한 번 신청한 정보. 같은 자료는 바로 다시 받고, 다른 자료는 저장된 정보로 한 번에 신청한다.
  const memory = useRememberedMaterialAccess()

  const isLoginGate = resource.gate === "login"
  const alreadyUnlocked = hasUnlockedMaterial(memory, resource.slug)
  const canUseRemembered =
    !isLoginGate && memory !== null && (alreadyUnlocked || canReuseForLeadRequest(memory))
  // 로그인 게이트는 자료 슬러그가 경로에 있으므로 material 파라미터가 필요 없다.
  const loginNextPath = `/resources/${resource.slug}?resume=download`

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

  // 실제 다운로드가 시작되는 순간(서명 URL 을 받은 직후) 1회. 서명 URL·이메일은 싣지 않는다 —
  // 자료 슬러그·게이트·경로만. lead_magnet 은 어드민 자료 지표(lead-magnet-metrics)가 슬러그로 묶는 키다.
  // 픽셀은 건너뛴다 — download_materials 는 Meta 에서 Lead 로 매핑돼, 자료 신청(CompleteRegistration)에
  // 더해 같은 사람이 Lead 로 한 번 더 잡힌다.
  const trackMaterialDownload = useCallback(() => {
    trackEvent(
      "download_materials",
      {
        asset_id: resource.slug,
        lead_magnet: resource.slug,
        gate: resource.gate,
        source: "resource_pdf_download",
        page_path: window.location.pathname,
      },
      { skipMarketingPixels: true }
    )
  }, [resource.gate, resource.slug])

  const showDownloadError = useCallback((downloadError: unknown) => {
    if (
      downloadError instanceof MaterialDownloadError &&
      downloadError.code === "login_required"
    ) {
      setLoginDialogOpen(true)
    } else if (downloadError instanceof MaterialDownloadError || downloadError instanceof LeadRequestError) {
      setError(downloadError.message)
    } else {
      setError("자료 다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    }
  }, [])

  // 다운로드 주소를 받아 그 자리에서 내려받는다. 예전처럼 PDF 주소로 이동하지 않으므로
  // Chrome 뷰어 탭이 열리지 않고, 폼 상태(완료 화면·다시 받기)가 남는다.
  const downloadMaterial = useCallback(
    async (email?: string) => {
      const result = await requestMaterialDownload({
        slug: resource.slug,
        email,
        source: "resource_pdf_download",
      })
      trackMaterialDownload()
      const outcome = deliverMaterialDownload(result, resource.title)
      if (outcome === "navigated") return
      setDownloadEmail(email ?? null)
      setCompletion(outcome === "downloaded" ? "downloaded" : "requested")
    },
    [resource.slug, resource.title, trackMaterialDownload]
  )

  // 로그인 게이트: 로그인 후 같은 페이지로 돌아오면 다운로드를 한 번 자동 실행한다.
  const runLoginDownload = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      await downloadMaterial()
    } catch (downloadError) {
      showDownloadError(downloadError)
    } finally {
      setLoading(false)
    }
  }, [downloadMaterial, showDownloadError])

  useEffect(() => {
    // 자동 재개는 로그인 게이트 전용. 이메일 게이트는 폼 입력이 필요하므로 재개하지 않는다.
    if (!isLoginGate) return
    if (resumedRef.current) return
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    if (params.get("resume") !== "download") return

    resumedRef.current = true

    params.delete("resume")
    const cleanedSearch = params.toString()
    const cleanedUrl =
      window.location.pathname +
      (cleanedSearch ? `?${cleanedSearch}` : "") +
      window.location.hash
    window.history.replaceState(window.history.state, "", cleanedUrl)

    void runLoginDownload()
  }, [isLoginGate, runLoginDownload])

  const submitLead = async (fields: {
    name: string
    org: string
    role: string
    size: string
    email: string
    phone: string
    marketingConsent: boolean
    website: string
  }) => {
    const attribution = collectLeadAttribution()
    const leadResponse = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...attribution,
        source: "newsletter",
        sourceDetail: `resource_pdf_download:${resource.slug}`,
        leadMagnet: resource.slug,
        name: fields.name,
        org: fields.org,
        role: fields.role,
        size: fields.size,
        email: fields.email,
        phone: fields.phone,
        message: `PDF 자료 요청: ${resource.title}`,
        marketingConsent: fields.marketingConsent,
        currentPage: attribution.currentPage ?? window.location.href,
        landingPage: attribution.landingPage ?? window.location.origin + window.location.pathname,
        referrer: attribution.referrer ?? document.referrer,
        anonymousId: getAnonymousId(),
        website: fields.website,
      }),
    })
    const leadData = await leadResponse.json().catch(() => null)

    if (!leadResponse.ok || !leadData?.ok) {
      throw new LeadRequestError(leadData?.error || "자료 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    }
    return leadData as { ok: true; stored?: boolean; conversionEventId?: string }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    const email = form.email.trim().toLowerCase()
    if (!email || !form.name.trim() || !form.org.trim() || !form.privacyConsent) {
      setError("필수 정보를 입력하고 개인정보 수집·이용에 동의해 주세요.")
      return
    }

    setLoading(true)
    setError("")

    let leadAccepted = false
    try {
      const leadData = await submitLead({
        name: form.name.trim(),
        org: form.org.trim(),
        role: form.role.trim(),
        size: form.size.trim(),
        email,
        phone: form.phone.trim(),
        marketingConsent: form.marketingConsent,
        website: form.website,
      })
      leadAccepted = true

      // 구독 전환은 선택 마케팅 동의를 한 사람만 센다. 서버가 저장하지 않은 제출
      // (허니팟·60초 중복 → stored:false)도 세지 않는다.
      if (form.marketingConsent && leadData.stored !== false) {
        trackEvent("submit_newsletter", {
          source: "resource_pdf_download",
          form_type: "resource",
          lead_magnet: resource.slug,
          gate: resource.gate,
          event_id: leadData.conversionEventId,
        })
      }

      await downloadMaterial(email)
    } catch (downloadError) {
      showDownloadError(downloadError)
    } finally {
      // 신청이 접수된 뒤에만 기억한다(다운로드가 실패해도 — 그다음은 입력 없이 다시 받는다).
      // 다운로드 단계가 끝난 뒤에 써야 요청 도중 화면이 '바로 받기'로 바뀌지 않는다.
      if (leadAccepted) {
        rememberMaterialAccess(
          {
            email,
            name: form.name,
            org: form.org,
            role: form.role,
            size: form.size,
          },
          resource.slug
        )
      }
      setLoading(false)
    }
  }

  // 저장된 정보로 받기. 이미 받은 자료는 리드를 다시 만들지 않고 바로 내려받고,
  // 처음 받는 자료는 저장된 정보로 신청(리드 1행)한 뒤 내려받는다.
  // 선택 마케팅 동의는 다시 보내지 않는다(false 는 철회가 아니라 '이번엔 묻지 않음').
  const handleRememberedDownload = async () => {
    if (loading || !memory) return

    setLoading(true)
    setError("")
    let leadAccepted = false
    try {
      if (!alreadyUnlocked) {
        await submitLead({
          name: memory.name ?? "",
          org: memory.org ?? "",
          role: memory.role ?? "",
          size: memory.size ?? "",
          email: memory.email,
          phone: "",
          marketingConsent: false,
          website: "",
        })
        leadAccepted = true
      }
      await downloadMaterial(memory.email)
    } catch (downloadError) {
      showDownloadError(downloadError)
    } finally {
      if (leadAccepted) rememberMaterialAccess({ email: memory.email }, resource.slug)
      setLoading(false)
    }
  }

  const handleRedownload = async () => {
    if (loading) return
    if (isLoginGate) {
      await runLoginDownload()
      return
    }
    const email = downloadEmail ?? memory?.email
    if (!email) {
      setCompletion(null)
      return
    }
    setLoading(true)
    setError("")
    try {
      await downloadMaterial(email)
    } catch (downloadError) {
      showDownloadError(downloadError)
    } finally {
      setLoading(false)
    }
  }

  // '다른 정보로 받기' — 학원 공용 PC 에서 앞사람 정보로 받지 않도록 기억을 지우고 빈 폼을 연다.
  const handleUseDifferentInfo = () => {
    forgetRememberedMaterialAccess()
    setForm(initialForm)
    setError("")
  }

  return (
    <div id="download" className="lg:h-full">
      <PublicLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        nextPath={loginNextPath}
        title="로그인 후 자료 받기"
      />
      {/* 섹션 높이에 맞춰 채우고, 내용이 넘치면 입력 영역만 스크롤한다(CTA는 항상 고정). */}
      <aside className="flex flex-col rounded-[14px] border border-black/[0.08] bg-white p-5 shadow-[0_18px_50px_rgba(17,17,16,0.07)] lg:h-full lg:max-h-[660px] lg:min-h-0">
      {completion === "downloaded" ? (
        <div className="flex min-h-[360px] flex-col justify-center text-center lg:min-h-0 lg:flex-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center border border-black/[0.08] bg-white text-fg-accent">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-fg-ink">PDF 다운로드를 시작했습니다.</h2>
          <p className="mt-3 text-caption leading-6 text-fg-muted">
            브라우저의 다운로드 폴더를 확인해 주세요. 받지 못했다면 다시 받기를 누르면 됩니다.
            {isLoginGate ? null : " 이 기기에서는 다음에도 정보 입력 없이 바로 받을 수 있습니다."}
          </p>
          {error ? <p className="mt-4 text-caption leading-6 text-fg-danger">{error}</p> : null}
          <Button
            type="button"
            disabled={loading}
            size="md"
            className="mt-6 w-full"
            onClick={() => void handleRedownload()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                다시 받기
              </>
            )}
          </Button>
          <Button type="button" variant="line" size="md" className="mt-2 w-full" onClick={scrollToChecklist}>
            전체 문항 보기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : completion === "requested" ? (
        <div className="flex min-h-[360px] flex-col justify-center text-center lg:min-h-0 lg:flex-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center border border-black/[0.08] bg-white text-fg-accent">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-fg-ink">자료 신청이 완료되었습니다.</h2>
          <p className="mt-3 text-caption leading-6 text-fg-muted">
            PDF 파일이 준비되면 같은 화면에서 바로 받을 수 있습니다. 먼저 아래 문항을 확인해 보세요.
          </p>
          <Button type="button" size="md" className="mt-6 w-full" onClick={scrollToChecklist}>
            전체 문항 보기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : isLoginGate ? (
        <div className="flex min-h-[360px] flex-col justify-center text-center lg:min-h-0 lg:flex-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-fg-accent/8 text-fg-accent">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-fg-ink">
            로그인 후 자료 받기
          </h2>
          <p className="mt-3 text-caption leading-6 text-fg-muted">
            이 자료는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다. 로그인하면
            자료를 바로 받을 수 있습니다.
          </p>
          <ResourceStats itemCount={resource.itemCount} estimatedMinutes={resource.estimatedMinutes} />
          {error ? <p className="mt-4 text-caption leading-6 text-fg-danger">{error}</p> : null}
          <Button
            type="button"
            disabled={loading}
            size="md"
            className="mt-5 w-full"
            onClick={() => {
              setError("")
              setLoginDialogOpen(true)
            }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <LockKeyhole className="h-4 w-4" />
                로그인하고 자료 받기
              </>
            )}
          </Button>
        </div>
      ) : canUseRemembered && memory ? (
        <div className="flex min-h-[360px] flex-col justify-center lg:min-h-0 lg:flex-1">
          <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-fg-accent">
            <Download className="h-3.5 w-3.5" />
            바로 받기
          </p>
          <h2 className="mt-2.5 text-[19px] font-bold tracking-[-0.02em] text-[#111110]">
            {alreadyUnlocked ? "이미 받은 자료입니다" : "이전에 입력한 정보로 받습니다"}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
            {alreadyUnlocked
              ? "정보를 다시 입력하지 않아도 바로 내려받을 수 있습니다."
              : "이 기기에 남은 신청 정보로 한 번에 받습니다. 다시 입력하지 않아도 됩니다."}
          </p>

          <div className="mt-5 rounded-[8px] border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-[13px] leading-6">
            {memory.org ? <p className="font-semibold text-[#111110]">{memory.org}</p> : null}
            <p className="flex items-center gap-1.5 text-[#615D59]">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {maskEmail(memory.email)}
            </p>
          </div>

          <ResourceStats itemCount={resource.itemCount} estimatedMinutes={resource.estimatedMinutes} />

          {alreadyUnlocked ? null : (
            <p className="mt-4 text-[12px] leading-5 text-[#615D59]">
              처음 동의한 개인정보 수집·이용 범위(자료 제공) 안에서 같은 정보로 이 자료를 신청합니다.{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보처리방침</a>
            </p>
          )}

          {error ? <p className="mt-4 text-caption leading-6 text-fg-danger">{error}</p> : null}

          <Button
            type="button"
            disabled={loading}
            size="md"
            className="mt-5 w-full"
            onClick={() => void handleRememberedDownload()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4" />
                {resource.hasPdfFile ? "PDF 바로 받기" : "자료 바로 신청하기"}
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={handleUseDifferentInfo}
            className="mt-3 self-center text-[13px] font-semibold text-[#615D59] underline underline-offset-4 hover:text-[#111110]"
          >
            다른 정보로 받기
          </button>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-fg-accent">
              <Download className="h-3.5 w-3.5" />
              {resource.hasPdfFile ? "무료 PDF 받기" : "PDF 자료 신청"}
            </p>
            <h2 className="mt-2.5 text-[19px] font-bold tracking-[-0.02em] text-[#111110]">
              기본 정보만 남기면 바로 받습니다
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
              이름·이메일·학원명이면 충분합니다. 한 번 입력하면 이 기기에서는 다음 자료도 바로 받습니다.
            </p>
          </div>

          <ResourceStats itemCount={resource.itemCount} estimatedMinutes={resource.estimatedMinutes} />

          <form
            onSubmit={handleSubmit}
            className="mt-5 flex flex-col space-y-3 lg:min-h-0 lg:flex-1 lg:space-y-0"
          >
            <input
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
              name="website"
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:overflow-y-auto lg:pr-1">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  이름 *
                </span>
                <Input
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className={inputClassName}
                  placeholder="홍길동"
                  autoComplete="name"
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
                    placeholder="name@academy.com"
                    autoComplete="email"
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
                  autoComplete="organization"
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
                  autoComplete="organization-title"
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
                  {ACADEMY_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
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
                  autoComplete="tel"
                />
              </label>
            </div>

            {/* 스크롤과 무관하게 동의·CTA는 항상 보이도록 하단 고정 */}
            <div className="shrink-0 space-y-3 lg:mt-4 lg:border-t lg:border-black/[0.08] lg:pt-4">
              <label className="flex gap-2 border border-black/[0.08] bg-[#F6F5F4] p-3 text-[12px] leading-5 text-[#615D59]">
                <input
                  type="checkbox"
                  checked={form.privacyConsent}
                  onChange={(event) => updateField("privacyConsent", event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-fg-accent"
                  required
                />
                <span>
                  [필수] 자료 제공을 위한 개인정보 수집·이용에 동의합니다. 수집 항목: 이름, 이메일,
                  학원명 및 선택 입력 정보 · 목적: 자료 제공 · 보유 기간: 개인정보처리방침 참조.{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보처리방침</a>
                </span>
              </label>

              <label className="flex gap-2 border border-black/[0.08] bg-white p-3 text-[12px] leading-5 text-[#615D59]">
                <input
                  type="checkbox"
                  checked={form.marketingConsent}
                  onChange={(event) => updateField("marketingConsent", event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-fg-accent"
                />
                <span>[선택] Classin 교육 인사이트·제품 소식 수신에 동의합니다. 언제든 수신거부할 수 있습니다.</span>
              </label>

              {error ? <p className="text-caption leading-6 text-fg-danger">{error}</p> : null}

              <Button type="submit" disabled={loading} size="md" className="w-full">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {resource.hasPdfFile ? "PDF 다운로드" : "PDF 자료 신청하기"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </>
      )}
      </aside>
    </div>
  )
}
