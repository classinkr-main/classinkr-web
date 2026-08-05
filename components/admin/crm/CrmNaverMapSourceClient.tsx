"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileInput,
  Link2,
  Loader2,
  MapPin,
  MapPinned,
  RefreshCw,
  Search,
} from "lucide-react"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import {
  parseNaverMapImportText,
  type NaverMapMatchStatus,
  type NaverMapPlaceInput,
} from "@/lib/crm/naver-map-source"
import type {
  CrmNaverMapRow,
  CrmNaverMapSourceList,
  ImportCrmNaverMapResult,
} from "@/lib/repositories/crm-naver-map"

const DEFAULT_SOURCE_URL =
  "https://map.naver.com/p/favorite/sharedPlace/folder/d34ac347a4754d119e80bb77fb8acfcf"
const CACHE_TTL_MS = 60_000

const MATCH_FILTERS: Array<{ key: "all" | NaverMapMatchStatus; label: string }> = [
  { key: "all", label: "매칭 전체" },
  { key: "linked", label: "연결 확정" },
  { key: "prelinked", label: "유력 후보" },
  { key: "review", label: "검토 필요" },
  { key: "unmatched", label: "미매칭" },
]

const MATCH_META: Record<
  NaverMapMatchStatus,
  { label: string; className: string; description: string }
> = {
  linked: {
    label: "연결 확정",
    className: "border-[#B7DEC4] bg-[#ECFDF5] text-[#084734]",
    description: "검수자가 기존 CRM 레코드와 연결했습니다.",
  },
  prelinked: {
    label: "유력 후보",
    className: "border-[#D7EBDD] bg-white text-[#084734]",
    description: "이름이 정확하고 다른 후보와 점수 차이가 큽니다. 확정 전 검수가 필요합니다.",
  },
  review: {
    label: "검토 필요",
    className: "border-[#E9D8B4] bg-[#FFF9ED] text-[#8B5E14]",
    description: "유사 이름 또는 REV 근거가 있으나 지점·동명이인 확인이 필요합니다.",
  },
  unmatched: {
    label: "미매칭",
    className: "border-[#e8e8e4] bg-[#F6F5F4] text-[#1a1a1a]/55",
    description: "기존 CRM·REV에서 강한 후보를 찾지 못했습니다.",
  },
}

const CANDIDATE_SOURCE_LABEL: Record<string, string> = {
  neo: "NEO 고객",
  customer: "전환 고객",
  partner: "파트너 계정",
  lead: "리드",
  rev: "REV",
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function confidenceLabel(value: number | null | undefined) {
  if (value == null) return null
  return `${Math.round(value * 100)}%`
}

function metricCard(label: string, value: number, tone: "default" | "green" | "amber" = "default") {
  const toneClass =
    tone === "green"
      ? "border-[#D7EBDD] bg-[#ECFDF5]"
      : tone === "amber"
        ? "border-[#E9D8B4] bg-[#FFF9ED]"
        : "border-black/[0.08] bg-white"
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold tracking-[0.06em] text-[#1a1a1a]/45">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#111110]">{value.toLocaleString("ko-KR")}</p>
    </div>
  )
}

function CandidateSummary({
  row,
  confirming,
  onConfirm,
}: {
  row: CrmNaverMapRow
  confirming: boolean
  onConfirm: (row: CrmNaverMapRow) => void
}) {
  if (row.confirmedTarget) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-3 py-2.5 text-[12px] text-[#084734]">
        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {row.confirmedTarget.targetLabel ?? row.confirmedTarget.targetId}
          <span className="ml-1 text-[#084734]/55">· 확정 연결</span>
        </span>
      </div>
    )
  }

  const candidate = row.candidate
  const rev = row.revEvidence && row.revEvidence.confidence >= 0.72 ? row.revEvidence : null
  if (!candidate && !rev) return null

  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-black/[0.08] bg-[#F6F5F4] px-3 py-2.5 text-[12px]">
      {candidate && candidate.confidence >= 0.72 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-1.5 text-[#1a1a1a]/70">
            <span className="font-semibold text-[#111110]">{candidate.label}</span>
            <span>{CANDIDATE_SOURCE_LABEL[candidate.source] ?? candidate.source}</span>
            <span>· {confidenceLabel(candidate.confidence)}</span>
            {candidate.sameRegion ? <span className="font-semibold text-[#084734]">지역 일치</span> : null}
          </p>
          {candidate.targetType !== "rev_deal" ? (
            <button
              type="button"
              onClick={() => onConfirm(row)}
              disabled={confirming || row.isStale}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#B7DEC4] bg-white px-3 text-[11px] font-semibold text-[#084734] hover:bg-[#ECFDF5] disabled:opacity-45"
            >
              {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              이 후보로 연결
            </button>
          ) : null}
        </div>
      ) : null}
      {rev ? (
        <p className="text-[#1a1a1a]/55">
          REV 근거: <span className="font-medium text-[#1a1a1a]/75">{rev.label}</span> · {confidenceLabel(rev.confidence)}
          {rev.sameRegion ? " · 지역 일치" : ""}
        </p>
      ) : null}
    </div>
  )
}

function MapSourceRow({
  row,
  confirming,
  onConfirm,
}: {
  row: CrmNaverMapRow
  confirming: boolean
  onConfirm: (row: CrmNaverMapRow) => void
}) {
  const match = MATCH_META[row.matchStatus]
  return (
    <article className={`rounded-xl border border-black/[0.08] bg-white p-4 ${row.isStale ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#111110]">{row.name}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${match.className}`} title={match.description}>
              {match.label}
            </span>
            {row.isStale ? (
              <span className="rounded-full border border-black/[0.08] bg-[#F6F5F4] px-2 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/45">
                이전 스냅샷
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[12px] text-[#1a1a1a]/50">{row.category || "분류 없음"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
            <MapPin className="h-3 w-3" />
            {row.regionLabel}
          </span>
          {row.localityLabel ? (
            <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60">
              {row.localityLabel}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-[#1a1a1a]/65">{row.address}</p>
      <CandidateSummary row={row} confirming={confirming} onConfirm={onConfirm} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-3 text-[11px] text-[#1a1a1a]/38">
        <span>수집 {formatDateTime(row.syncedAt)}</span>
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-[#084734] hover:underline"
        >
          네이버 지도
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  )
}

export default function CrmNaverMapSourceClient() {
  const [data, setData] = useState<CrmNaverMapSourceList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [matchFilter, setMatchFilter] = useState<"all" | NaverMapMatchStatus>("all")
  const [regionFilter, setRegionFilter] = useState("all")
  const [includeStale, setIncludeStale] = useState(false)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  const [sourceUrl, setSourceUrl] = useState(DEFAULT_SOURCE_URL)
  const [sourceLabel, setSourceLabel] = useState("Han37 고객사")
  const [expectedCount, setExpectedCount] = useState("199")
  const [rawImport, setRawImport] = useState("")
  const [fullSnapshot, setFullSnapshot] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [linkingExternalId, setLinkingExternalId] = useState<string | null>(null)
  const [linkMessage, setLinkMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJsonCached<CrmNaverMapSourceList>(
        "/api/admin/crm/map-source",
        undefined,
        { ttlMs: CACHE_TTL_MS, force }
      )
      setData(next)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "지도 원천을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const parsedImport = useMemo(() => {
    if (!rawImport.trim()) return { places: [] as NaverMapPlaceInput[], error: null as string | null }
    try {
      return { places: parseNaverMapImportText(rawImport), error: null }
    } catch (parseError) {
      return {
        places: [] as NaverMapPlaceInput[],
        error: parseError instanceof Error ? parseError.message : "가져오기 형식을 읽지 못했습니다.",
      }
    }
  }, [rawImport])

  const filteredRows = useMemo(() => {
    return (data?.rows ?? []).filter((row) => {
      if (!includeStale && row.isStale) return false
      if (matchFilter !== "all" && row.matchStatus !== matchFilter) return false
      if (regionFilter !== "all" && row.regionLabel !== regionFilter) return false
      if (!deferredQuery) return true
      const haystack = [row.name, row.category, row.address, row.regionLabel, row.localityLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(deferredQuery)
    })
  }, [data?.rows, deferredQuery, includeStale, matchFilter, regionFilter])

  const submitImport = useCallback(async () => {
    if (parsedImport.error || parsedImport.places.length === 0) {
      setImportMessage(parsedImport.error ?? "가져올 장소를 붙여넣으세요.")
      return
    }
    setImporting(true)
    setImportMessage(null)
    try {
      const response = await adminFetchJson<{ ok: true; result: ImportCrmNaverMapResult }>(
        "/api/admin/crm/map-source",
        {
          method: "POST",
          body: JSON.stringify({
            sourceUrl,
            sourceLabel,
            expectedCount: Number(expectedCount),
            fullSnapshot,
            places: parsedImport.places,
          }),
        }
      )
      setImportMessage(
        `${response.result.imported}개를 저장했습니다.${response.result.staleMarked ? ` 이전 항목 ${response.result.staleMarked}개를 오래됨 처리했습니다.` : ""}`
      )
      await load(true)
    } catch (importError) {
      setImportMessage(importError instanceof Error ? importError.message : "가져오기에 실패했습니다.")
    } finally {
      setImporting(false)
    }
  }, [expectedCount, fullSnapshot, load, parsedImport, sourceLabel, sourceUrl])

  const confirmCandidate = useCallback(
    async (row: CrmNaverMapRow) => {
      const candidate = row.candidate
      if (!candidate || candidate.confidence < 0.72 || candidate.targetType === "rev_deal") return

      setLinkingExternalId(row.externalId)
      setLinkMessage(null)
      try {
        await adminFetchJson("/api/admin/crm/map-source/link", {
          method: "POST",
          body: JSON.stringify({
            externalId: row.externalId,
            targetType: candidate.targetType,
            targetId: candidate.targetId,
          }),
        })
        setLinkMessage({ tone: "success", text: `${row.name}을(를) ${candidate.label}과 연결했습니다.` })
        await load(true)
      } catch (linkError) {
        setLinkMessage({
          tone: "error",
          text: linkError instanceof Error ? linkError.message : "CRM 연결을 확정하지 못했습니다.",
        })
      } finally {
        setLinkingExternalId(null)
      }
    },
    [load]
  )

  return (
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#084734]">CUSTOMER SOURCE</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-[-0.04em] text-[#111110] sm:text-3xl">
            <MapPinned className="h-6 w-6 text-[#084734]" />
            지도 원천
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#1a1a1a]/55">
            네이버 공유지도를 CRM 정본과 분리해 보관하고, 주소 기반 지역 라벨과 기존 고객·REV 매칭 후보를 검수합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-[#1a1a1a]/70 transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </header>

      {error ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#E9D8B4] bg-[#FFF9ED] p-4 text-[13px] text-[#8B5E14]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {data?.warnings.map((warning) => (
        <div key={warning} className="mt-3 flex items-start gap-2 rounded-xl border border-[#E9D8B4] bg-[#FFF9ED] p-3 text-[12px] text-[#8B5E14]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warning}
        </div>
      ))}

      {linkMessage ? (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-[12px] ${
            linkMessage.tone === "success"
              ? "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
              : "border-[#E9D8B4] bg-[#FFF9ED] text-[#8B5E14]"
          }`}
        >
          {linkMessage.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          {linkMessage.text}
        </div>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metricCard("활성 장소", data?.summary.active ?? 0)}
        {metricCard("연결 확정", data?.summary.linked ?? 0, "green")}
        {metricCard("유력 후보", data?.summary.prelinked ?? 0, "green")}
        {metricCard("검토 필요", data?.summary.review ?? 0, "amber")}
        {metricCard("미매칭", data?.summary.unmatched ?? 0)}
      </section>

      <details className="mt-6 rounded-xl border border-black/[0.08] bg-white">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[13px] font-semibold text-[#111110] marker:hidden">
          <FileInput className="h-4 w-4 text-[#084734]" />
          지도 스냅샷 가져오기
          <span className="ml-auto text-[11px] font-normal text-[#1a1a1a]/40">Admin 전용</span>
        </summary>
        <div className="border-t border-black/[0.06] p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="text-[12px] font-semibold text-[#1a1a1a]/65">
              네이버 공유지도 URL
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-black/[0.08] px-3 text-[13px] font-normal outline-none focus:border-[#084734]"
              />
            </label>
            <label className="text-[12px] font-semibold text-[#1a1a1a]/65">
              원천 라벨
              <input
                value={sourceLabel}
                onChange={(event) => setSourceLabel(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-black/[0.08] px-3 text-[13px] font-normal outline-none focus:border-[#084734]"
              />
            </label>
          </div>
          <label className="mt-3 block text-[12px] font-semibold text-[#1a1a1a]/65">
            장소 목록
            <textarea
              value={rawImport}
              onChange={(event) => setRawImport(event.target.value)}
              rows={8}
              placeholder={"이름\t분류\t주소\n○○학원\t수학교육\t서울특별시 강남구 ..."}
              className="mt-1.5 w-full rounded-lg border border-black/[0.08] p-3 font-mono text-[12px] leading-5 outline-none focus:border-[#084734]"
            />
          </label>
          <div className="mt-3 flex flex-col gap-3 rounded-lg bg-[#F6F5F4] p-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-[12px] text-[#1a1a1a]/65">
              예상 장소 수
              <input
                type="number"
                min={1}
                max={1000}
                value={expectedCount}
                onChange={(event) => setExpectedCount(event.target.value)}
                className="h-9 w-20 rounded-md border border-black/[0.08] bg-white px-2 text-right font-semibold"
              />
            </label>
            <span className={`text-[12px] ${parsedImport.error ? "text-[#B85C33]" : "text-[#1a1a1a]/50"}`}>
              {parsedImport.error ?? `인식된 장소 ${parsedImport.places.length}개`}
            </span>
            <label className="flex items-center gap-2 text-[12px] text-[#1a1a1a]/65 sm:ml-auto">
              <input
                type="checkbox"
                checked={fullSnapshot}
                onChange={(event) => setFullSnapshot(event.target.checked)}
                className="h-4 w-4 accent-[#084734]"
              />
              전체 스냅샷 · 누락된 이전 항목 오래됨 처리
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-5 text-[#1a1a1a]/42">
              이름·주소가 같은 행은 중복으로 거부합니다. 전체 스냅샷 체크 전에는 기존 항목을 오래됨 처리하지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => void submitImport()}
              disabled={importing || parsedImport.places.length === 0}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white disabled:opacity-45"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileInput className="h-4 w-4" />}
              가져오기
            </button>
          </div>
          {importMessage ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-black/[0.08] bg-white p-3 text-[12px] text-[#1a1a1a]/65">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" />
              {importMessage}
            </p>
          ) : null}
        </div>
      </details>

      <section className="mt-6 rounded-xl border border-black/[0.08] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#1a1a1a]/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학원명·주소·지역 검색"
              className="min-h-11 w-full rounded-lg border border-black/[0.08] pl-9 pr-3 text-[13px] outline-none focus:border-[#084734]"
            />
          </label>
          <select
            value={matchFilter}
            onChange={(event) => setMatchFilter(event.target.value as "all" | NaverMapMatchStatus)}
            className="min-h-11 rounded-lg border border-black/[0.08] bg-white px-3 text-[13px] font-medium text-[#1a1a1a]/70"
          >
            {MATCH_FILTERS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-black/[0.08] px-3 text-[12px] text-[#1a1a1a]/60">
            <input
              type="checkbox"
              checked={includeStale}
              onChange={(event) => setIncludeStale(event.target.checked)}
              className="h-4 w-4 accent-[#084734]"
            />
            이전 스냅샷 포함
          </label>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setRegionFilter("all")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${regionFilter === "all" ? "border-[#084734] bg-[#084734] text-white" : "border-black/[0.08] bg-white text-[#1a1a1a]/55"}`}
          >
            지역 전체
          </button>
          {(data?.summary.regions ?? []).map((region) => (
            <button
              key={region.label}
              type="button"
              onClick={() => setRegionFilter(region.label)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${regionFilter === region.label ? "border-[#084734] bg-[#084734] text-white" : "border-black/[0.08] bg-white text-[#1a1a1a]/55"}`}
            >
              {region.label} {region.count}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between text-[12px] text-[#1a1a1a]/45">
        <span>표시 {filteredRows.length.toLocaleString("ko-KR")}개</span>
        <span>최근 수집 {formatDateTime(data?.latestSyncedAt)}</span>
      </div>

      {loading && !data ? (
        <div className="mt-4 flex min-h-48 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-[#1a1a1a]/45">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          지도 원천을 불러오는 중입니다.
        </div>
      ) : filteredRows.length > 0 ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {filteredRows.map((row) => (
            <MapSourceRow
              key={row.externalId}
              row={row}
              confirming={linkingExternalId === row.externalId}
              onConfirm={(candidateRow) => void confirmCandidate(candidateRow)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-black/[0.12] bg-[#F6F5F4] px-6 text-center">
          <MapPinned className="h-7 w-7 text-[#1a1a1a]/25" />
          <p className="mt-3 text-[14px] font-semibold text-[#111110]">표시할 지도 장소가 없습니다.</p>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/45">필터를 바꾸거나 위 가져오기 영역에서 스냅샷을 등록하세요.</p>
        </div>
      )}
    </div>
  )
}
