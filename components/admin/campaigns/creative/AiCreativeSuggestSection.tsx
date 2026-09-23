"use client"

import { useCallback, useRef, useState } from "react"
import { AlertCircle, Lightbulb, Loader2, Sparkles } from "lucide-react"
import { ChartSkeleton, EmptyState } from "@/components/admin/viz"
import { money } from "@/components/admin/campaigns/event-format"
import { PeriodToggle, type PeriodOption } from "@/components/admin/PeriodToggle"
import { adminFetchJson } from "@/lib/admin-client"
import type { RankedCreativeWithSpend } from "@/lib/marketing/compass-creative"
import type { AdCreativePerf } from "@/lib/marketing/creative-input"

// ─── AI 소재 제안 ─────────────────────────────────────────────────────────
// 랭킹 뼈대는 leads UTM 기준 "리드·전환 건수"이고, 여기에 Compass 브리지(compass_ads_v,
// ad 레벨 Meta insights)의 소재별 지출·CPL 을 광고명으로 조인해 얹는다(2026-08-28).
// 정직 규칙: 조인 실패는 "—"(미집계)이지 0 이 아니고, CPL 은 Compass 축끼리 나눈 값이며,
// 매출·ROAS 는 여전히 없다. 각주(note)가 매칭 건수와 원천을 매번 밝힌다
// (서버는 app/api/admin/marketing/creative-suggest, 조인은 lib/marketing/compass-creative).
// 구 광고 탭(MetaTab)에서 2026-09-14 상세 › 소재 섹션으로 옮겼다(로직 무변경).

type CreativeSuggestPeriod = "30d" | "90d"

const CREATIVE_SUGGEST_PERIOD_OPTIONS: readonly PeriodOption<CreativeSuggestPeriod>[] = [
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
]

interface CreativeSuggestionCard {
  headline: string
  body: string
  rationale: string
}

interface CreativeSuggestResponse {
  ranked: { top: RankedCreativeWithSpend[]; bottom: RankedCreativeWithSpend[] }
  patterns: string[]
  suggestions: CreativeSuggestionCard[]
  model: string
  note: string
}

function creativeRowLabel(row: AdCreativePerf): string {
  return row.ad || row.adset || row.campaign || "미확인 소재"
}

function AdCreativeRankRow({ row }: { row: RankedCreativeWithSpend }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
      <span
        className="min-w-0 truncate text-[#111110]"
        title={[row.campaign, row.adset, row.ad].filter(Boolean).join(" · ")}
      >
        {creativeRowLabel(row)}
      </span>
      <span className="flex shrink-0 items-center gap-3 tabular-nums text-[11px] text-[#1a1a1a]/45">
        {/* CPL 은 Compass 축(지출 ÷ Meta 리포트 리드) — 옆의 리드 수와 분모가 달라 나눠 떨어지지
            않는 것이 정상이다. 매칭 실패는 "—"(미집계)로 두고 0 으로 채우지 않는다. */}
        <span title="Compass 수집 지출 ÷ Meta 리포트 리드">
          CPL {row.cpl_usd != null ? money(row.cpl_usd, "USD") : "—"}
        </span>
        <span className={row.converted > 0 ? "font-semibold text-[#084734]" : ""}>전환 {row.converted}</span>
        <span className="min-w-[2rem] text-right text-[12px] font-bold text-[#111110]">{row.leads}</span>
      </span>
    </div>
  )
}

// 자체 기간·실행 상태를 들고 있어 부모의 props 확장이 필요 없다.
export default function AiCreativeSuggestSection() {
  const [period, setPeriod] = useState<CreativeSuggestPeriod>("90d")
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [result, setResult] = useState<CreativeSuggestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 중복 클릭 방지 — setState는 비동기라 상태만으로는 연타 중 두 번째 요청을 못 막는다(AdLeadsPanel의
  // convertingRef와 같은 패턴).
  const runningRef = useRef(false)

  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setStatus("loading")
    setError(null)
    try {
      const data = await adminFetchJson<CreativeSuggestResponse>("/api/admin/marketing/creative-suggest", {
        method: "POST",
        body: JSON.stringify({ period }),
      })
      setResult(data)
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 소재 제안을 생성하지 못했습니다.")
      setStatus("error")
    } finally {
      runningRef.current = false
    }
  }, [period])

  const busy = status === "loading"

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[#111110]">AI 소재 제안</h3>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            리드·전환 건수 기준 랭킹 · 소재별 지출·CPL 은 Compass 조인이 될 때만
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle
            options={CREATIVE_SUGGEST_PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            ariaLabel="소재 제안 기간"
          />
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {status === "done" ? "다시 생성" : "제안 생성"}
          </button>
        </div>
      </div>

      {status === "error" && error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12.5px] text-[#B43E3E]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void run()}
              className="mt-1 font-semibold underline underline-offset-2"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {status === "idle" && (
        <EmptyState
          title="아직 생성한 제안이 없습니다"
          description="기간을 고르고 실행하면 리드가 몰린 소재의 패턴과 다음에 시도할 소재 제안을 받습니다."
          action={
            <button
              type="button"
              onClick={() => void run()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#111110] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#2a2a28]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              제안 생성
            </button>
          }
        />
      )}

      {busy && !result && <ChartSkeleton className="h-[160px]" />}

      {result && (
        <div className="space-y-4">
          {result.patterns.length > 0 && (
            // 그린 아웃라인 카드 — 채움 없이 보더로만 강조(BriefingCard와 같은 원칙, 파스텔 채움 지양).
            <div className="rounded-2xl border border-[#BDEFD8] bg-white p-4 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
                잘 되는 소재의 패턴
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {result.patterns.map((pattern, index) => (
                  <li key={index} className="flex gap-2 text-[12.5px] leading-relaxed text-[#1a1a1a]/70">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#A39E98]" />
                    <span className="min-w-0">{pattern}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.suggestions.map((suggestion, index) => (
                <div key={index} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                  <div className="flex items-center gap-1.5 text-[#615D59]">
                    <Lightbulb className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">제안 {index + 1}</span>
                  </div>
                  <p className="mt-2 text-[13.5px] font-bold leading-snug text-[#111110]">{suggestion.headline}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/60">{suggestion.body}</p>
                  <p className="mt-2.5 border-t border-[#f0f0ec] pt-2 text-[11px] leading-relaxed text-[#1a1a1a]/40">
                    근거: {suggestion.rationale}
                  </p>
                </div>
              ))}
            </div>
          )}

          {result.ranked.top.length > 0 && (
            <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3.5 sm:px-5">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/45">근거가 된 상위 소재(리드 기준)</p>
              <div className="mt-1 divide-y divide-[#f0f0ec]">
                {result.ranked.top.slice(0, 5).map((row, index) => (
                  <AdCreativeRankRow key={`${row.campaign ?? ""}-${row.adset ?? ""}-${row.ad ?? ""}-${index}`} row={row} />
                ))}
              </div>
            </div>
          )}

          <p className="text-[10.5px] text-[#1a1a1a]/35">
            모델 {result.model} · {result.note}
          </p>
        </div>
      )}
    </div>
  )
}
