"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Clock, Download, FileText, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackEvent } from "@/lib/analytics"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetItemCount,
  getLeadMagnetPublicGateLabel,
  getLeadMagnetTierLabel,
  type LeadMagnet,
  type LeadMagnetCategory,
} from "@/lib/lead-magnets"

type ResourceFilter = "all" | LeadMagnetCategory

const FILTERS: { value: ResourceFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "operations", label: "운영" },
  { value: "hardware", label: "하드웨어" },
  { value: "software", label: "소프트웨어" },
  { value: "case-study", label: "사례" },
  { value: "security", label: "보안" },
]

interface Props {
  resources: readonly LeadMagnet[]
}

type SubmitState =
  | { status: "idle"; message?: string }
  | { status: "loading"; message?: string }
  | { status: "done"; message?: string }
  | { status: "error"; message: string }

function getInitialSubmitState(resources: readonly LeadMagnet[]) {
  return Object.fromEntries(
    resources.map((resource) => [resource.slug, { status: "idle" as const }])
  ) as Record<string, SubmitState>
}

export function ResourcesHubClient({ resources }: Props) {
  const [filter, setFilter] = useState<ResourceFilter>("all")
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [states, setStates] = useState<Record<string, SubmitState>>(() =>
    getInitialSubmitState(resources)
  )
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const trackedImpressionsRef = useRef(new Set<string>())

  const visibleResources = useMemo(
    () =>
      resources.filter((resource) => {
        if (filter === "all") return true
        return resource.category === filter
      }),
    [filter, resources]
  )

  useEffect(() => {
    const trackImpression = (resource: LeadMagnet) => {
      if (trackedImpressionsRef.current.has(resource.slug)) return
      trackedImpressionsRef.current.add(resource.slug)
      trackEvent("view_resource_card", {
        source: "resources_hub",
        lead_magnet: resource.slug,
        gate: resource.gate,
        tier: resource.tier,
        category: resource.category,
      })
    }

    if (typeof IntersectionObserver === "undefined") {
      visibleResources.forEach(trackImpression)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const slug = (entry.target as HTMLElement).dataset.resourceSlug
          const resource = visibleResources.find((item) => item.slug === slug)
          if (!resource) return
          trackImpression(resource)
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.35 }
    )

    visibleResources.forEach((resource) => {
      const node = cardRefs.current.get(resource.slug)
      if (node) observer.observe(node)
    })

    return () => observer.disconnect()
  }, [visibleResources])

  const submit = async (resource: LeadMagnet) => {
    const email = emails[resource.slug]?.trim().toLowerCase()
    if (!email || states[resource.slug]?.status === "loading") return

    setStates((prev) => ({
      ...prev,
      [resource.slug]: { status: "loading" },
    }))

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: `resources_hub:${resource.slug}`,
          leadMagnet: resource.slug,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.ok) {
        setStates((prev) => ({
          ...prev,
          [resource.slug]: {
            status: "error",
            message: data?.error || "신청에 실패했습니다. 잠시 후 다시 시도해주세요.",
          },
        }))
        return
      }

      trackEvent("submit_newsletter", {
        source: "resources_hub",
        lead_magnet: resource.slug,
        gate: resource.gate,
      })
      setStates((prev) => ({
        ...prev,
        [resource.slug]: { status: "done", message: "신청이 완료되었습니다." },
      }))
    } catch {
      setStates((prev) => ({
        ...prev,
        [resource.slug]: { status: "error", message: "네트워크 오류가 발생했습니다." },
      }))
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      <section className="container">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#084734]">
              Classin Resources
            </p>
            <h1 className="mt-4 max-w-4xl text-[2.35rem] font-black leading-[1.08] tracking-display sm:text-4xl md:text-6xl">
              학원 도입 전,
              <br className="hidden md:block" /> 필요한 자료부터 확인하세요.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#615D59]">
              운영 점검, 교실 구축, 도입 준비 자료를 한곳에 모았습니다. 블로그와 가이드에서
              이어지는 자료는 이 페이지에서 관리합니다.
            </p>
          </div>
          <div className="rounded-lg border border-black/[0.08] bg-white p-5 shadow-[0_6px_18px_rgba(17,17,16,0.035)]">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#084734]/70">
              운영 방식
            </p>
            <div className="mt-4 space-y-3 text-[13px] leading-6 text-[#615D59]">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                블로그, 가이드, 제품 페이지 CTA는 이 자료실의 개별 자료로 연결합니다.
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                일반 자료는 이메일로, 심화 자료는 추후 로그인 기반으로 제공합니다.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="자료 카테고리">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={`min-h-10 shrink-0 rounded-[6px] border px-4 text-sm font-semibold transition-colors ${
                filter === item.value
                  ? "border-[#084734]/20 bg-[#ECFDF5] text-[#084734]"
                  : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {visibleResources.map((resource) => {
            const state = states[resource.slug] ?? { status: "idle" }
            const isPublished = resource.published
            const resourceUrl = isPublished ? resource.resourceUrl : undefined
            const itemCount = getLeadMagnetItemCount(resource)

            return (
              <article
                key={resource.slug}
                ref={(node) => {
                  if (node) cardRefs.current.set(resource.slug, node)
                  else cardRefs.current.delete(resource.slug)
                }}
                data-resource-slug={resource.slug}
                className="flex min-h-[420px] flex-col rounded-lg border border-black/[0.08] bg-white p-5 shadow-[0_6px_18px_rgba(17,17,16,0.035)] md:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-[11px] font-bold text-[#084734]">
                    <span className="rounded-full bg-[#ECFDF5] px-2.5 py-1">
                      {getLeadMagnetCategoryLabel(resource.category)}
                    </span>
                    <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[#615D59]">
                      {getLeadMagnetTierLabel(resource.tier)} 자료
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex-1">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#084734]/65">
                    {resource.ctaCopy.eyebrow}
                  </p>
                  <h2 className="mt-2 text-[24px] font-black leading-tight tracking-[-0.03em] text-[#111110]">
                    {resource.title}
                  </h2>
                  <p className="mt-3 text-[14px] leading-7 text-[#615D59]">
                    {resource.summary}
                  </p>
                  <div className="mt-4 grid gap-2 text-[12px] font-semibold text-[#084734]/75 sm:grid-cols-3">
                    <span className="rounded-[6px] bg-[#ECFDF5] px-3 py-2">{itemCount}문항</span>
                    <span className="rounded-[6px] bg-[#F6F5F4] px-3 py-2 text-[#615D59]">
                      약 {resource.estimatedMinutes}분
                    </span>
                    <span className="rounded-[6px] bg-[#F6F5F4] px-3 py-2 text-[#615D59]">
                      {getLeadMagnetTierLabel(resource.tier)}
                    </span>
                  </div>
                  <p className="mt-4 text-[12px] font-semibold text-[#084734]/75">
                    추천 대상: {resource.audience}
                  </p>
                  <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.14em] text-[#A39E98]">
                    포함 자료
                  </p>
                  <ul className="mt-3 space-y-2">
                    {resource.deliverables.slice(0, 3).map((item) => (
                      <li key={item} className="flex gap-2 text-[13px] leading-6 text-[#615D59]">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 border-t border-black/[0.08] pt-5">
                  {!isPublished ? (
                    <div className="flex min-h-11 items-center justify-center gap-2 rounded-[6px] border border-black/[0.08] bg-[#F6F5F4] px-4 text-sm font-semibold text-[#615D59]">
                      <Clock className="h-4 w-4" />
                      준비 중
                    </div>
                  ) : state.status === "done" && resourceUrl ? (
                    <Button asChild className="h-11 w-full">
                      <Link
                        href={resourceUrl}
                        onClick={() =>
                          trackEvent("download_materials", {
                            source: "resources_hub",
                            lead_magnet: resource.slug,
                            gate: resource.gate,
                          })
                        }
                      >
                        <Download className="h-4 w-4" />
                        자료 보기
                      </Link>
                    </Button>
                  ) : resource.gate === "email" ? (
                    <form
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_128px]"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void submit(resource)
                      }}
                    >
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                        <Input
                          type="email"
                          required
                          value={emails[resource.slug] ?? ""}
                          onChange={(event) =>
                            setEmails((prev) => ({
                              ...prev,
                              [resource.slug]: event.target.value,
                            }))
                          }
                          placeholder="이메일"
                          className="h-11 pl-10"
                        />
                      </div>
                      <Button type="submit" disabled={state.status === "loading"} className="h-11">
                        {state.status === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            {getLeadMagnetPublicGateLabel(resource.gate)}
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </form>
                  ) : resourceUrl ? (
                    <Button asChild className="h-11 w-full">
                      <Link
                        href={resourceUrl}
                        onClick={() =>
                          trackEvent("download_materials", {
                            source: "resources_hub",
                            lead_magnet: resource.slug,
                            gate: resource.gate,
                          })
                        }
                      >
                        {getLeadMagnetPublicGateLabel(resource.gate)}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}

                  {state.status === "error" ? (
                    <p className="mt-2 text-[12px] leading-5 text-[#B85C33]">{state.message}</p>
                  ) : state.status === "done" ? (
                    <p className="mt-2 text-[12px] leading-5 text-[#084734]">{state.message}</p>
                  ) : !isPublished ? (
                    <p className="mt-2 text-[11px] leading-5 text-[#A39E98]">
                      공개 준비가 끝나면 블로그, 가이드, 제품 페이지의 관련 CTA에 연결됩니다.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] leading-5 text-[#A39E98]">
                      자료 신청 시 교육 인사이트와 제품 소식을 이메일로 받아볼 수 있습니다.
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
