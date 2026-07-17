"use client"
import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { ledgerMonthConfirmed } from "@/lib/branch/computations/revenue-core"
import MoneyValue from "../MoneyValue"

export interface DealModalDeal {
  id: string
  customer: string
  manager?: string | null
  team?: string | null
  region?: string | null
  amount?: number
  date?: string
  status?: string | null
  stageLabel?: string
  stageColor?: string
  probability?: number
  items?: string
  productVersion?: string | null
  dealType?: string | null
  note?: string | null
  contractTarget?: number | null
  firstPayment?: string | null
  monthlyPayments?: Record<string, number>
  monthlyRed?: Record<string, boolean>
  monthlyConfirmed?: Record<string, number>
  monthlyHighConfidence?: Record<string, number>
  loadingDetail?: boolean
}

function summarizeProductMix(productVersion: string | null | undefined) {
  if (!productVersion) return null
  const tokens = productVersion
    .split(/[,\n;/|·•]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return null
  const hw: string[] = []
  const sw: string[] = []
  for (const t of tokens) {
    if (/^hardware-/i.test(t)) hw.push(t.replace(/^hardware-/i, ""))
    else sw.push(t)
  }
  return { hw, sw }
}


const TEAM_COLOR: Record<string, string> = {
  BD: "#084734", MKT: "#7B8B36", CSM: "#A8741A",
}

export default function DealModal({ deal, onClose }: { deal: DealModalDeal | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dealId = deal?.id ?? null

  useEffect(() => {
    if (!deal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [deal, onClose])

  useEffect(() => {
    if (!dealId) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()

    return () => {
      previouslyFocused?.focus()
    }
  }, [dealId])

  if (!deal) return null

  const teamColor = (deal.team && TEAM_COLOR[deal.team]) || "#615D59"
  const isConfirmed = (deal.status ?? "").toLowerCase().includes("confirm") || deal.probability === 100

  const monthlyEntries = deal.monthlyPayments
    ? Object.entries(deal.monthlyPayments)
        .filter(([, v]) => Number(v) !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
    : []
  // 월별 확정 금액은 rev-confirmed 캐논 단일 산식(revenue-core) — 이전의 'red 미표시=확정'
  // 휴리스틱은 무색상 미래 월까지 확정으로 부풀리고 부분 확정 금액을 무시해
  // summary·장부(같은 캐논 소비)와 숫자가 어긋났다.
  const monthlyConfidence = monthlyEntries.map(([ym, v]) => {
    const amount = Number(v)
    return { ym, amount, confirmedAmount: ledgerMonthConfirmed(deal, ym, amount) }
  })
  const confirmedSum = monthlyConfidence.reduce((s, m) => s + m.confirmedAmount, 0)
  const targetVal = deal.contractTarget ?? null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="deal-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
        <button type="button" onClick={onClose}
          ref={closeButtonRef}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(0,0,0,0.05)] text-[#111110] transition hover:bg-[rgba(0,0,0,0.1)]">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 flex items-start justify-between gap-3 pr-8">
          <div>
            {deal.stageLabel && (
              <span className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: `${deal.stageColor ?? teamColor}22`, color: deal.stageColor ?? teamColor }}>
                {deal.stageLabel}
              </span>
            )}
            <h2 id="deal-modal-title" className="mt-2 text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#111110]">{deal.customer}</h2>
            {(() => {
              const mix = summarizeProductMix(deal.productVersion)
              if (!mix || (mix.hw.length === 0 && mix.sw.length === 0)) return null
              return (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {mix.hw.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-[#1E5DA8]/10 px-2 py-[3px] font-semibold text-[#1E5DA8]"
                      title={mix.hw.join(", ")}
                    >
                      HW {mix.hw.length}
                    </span>
                  )}
                  {mix.sw.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-[#084734]/10 px-2 py-[3px] font-semibold text-[#084734]"
                      title={mix.sw.join(", ")}
                    >
                      SW {mix.sw.length}
                    </span>
                  )}
                  {deal.dealType && (
                    <span className="text-[#615D59]">· {deal.dealType}</span>
                  )}
                </div>
              )
            })()}
            <p className="mt-1 text-[12px] text-[#615D59]">
              {deal.id} {deal.region ? `· ${deal.region}` : ""}
            </p>
          </div>
        </div>

        {(deal.date || deal.amount != null) && (
          <div className="mb-3.5 rounded-[10px] bg-[#F6F5F4] p-4">
            {deal.date && (
              <>
                <p className="text-[12px] text-[#615D59]">예정일</p>
                <p className="mt-0.5 text-[18px] font-bold tracking-[-0.01em] text-[#111110]">{deal.date}</p>
              </>
            )}
            {deal.amount != null && (
              <p className="mt-1 text-[14px] font-bold" style={{ color: isConfirmed ? "#B43E3E" : "#1E5DA8" }}>
                <MoneyValue value={deal.amount} />
                <span className="ml-1.5 text-[10.5px] font-semibold text-[#615D59]">
                  {isConfirmed ? "· 확정" : "· 가능성"}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10.5px] font-semibold text-[#615D59]">담당 / 팀</p>
            <p className="mt-1 text-[13.5px] font-semibold text-[#111110]">
              {deal.manager ?? "-"} {deal.team && <span className="ml-1 font-bold" style={{ color: teamColor }}>{deal.team}</span>}
            </p>
          </div>
          {deal.probability != null && (
            <div>
              <p className="text-[10.5px] font-semibold text-[#615D59]">확률</p>
              <p className="mt-1 text-[13.5px] font-bold" style={{ color: deal.probability >= 70 ? "#084734" : deal.probability >= 40 ? "#7B8B36" : "#A8741A" }}>
                {deal.probability}%
              </p>
            </div>
          )}
          {deal.status && (
            <div>
              <p className="text-[10.5px] font-semibold text-[#615D59]">상태</p>
              <p className="mt-1 text-[13.5px] font-semibold text-[#111110]">{deal.status}</p>
            </div>
          )}
          {deal.items && (
            <div className="col-span-2">
              <p className="text-[10.5px] font-semibold text-[#615D59]">설치 품목</p>
              <p className="mt-1 text-[13px] text-[#111110]">{deal.items}</p>
            </div>
          )}
          {targetVal != null && (
            <div>
              <p className="text-[10.5px] font-semibold text-[#615D59]">계약 목표</p>
              <p className="mt-1 text-[13.5px] font-bold text-[#111110]"><MoneyValue value={targetVal} /></p>
            </div>
          )}
          {deal.firstPayment && (
            <div>
              <p className="text-[10.5px] font-semibold text-[#615D59]">최초 결제일</p>
              <p className="mt-1 text-[13.5px] font-semibold text-[#111110]">{deal.firstPayment}</p>
            </div>
          )}
        </div>

        {deal.note && (
          <div className="mt-3.5 rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-3 py-2.5">
            <p className="mb-1 text-[10.5px] font-semibold text-[#615D59]">메모</p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#111110]">{deal.note}</p>
          </div>
        )}

        {(deal.loadingDetail || monthlyEntries.length > 0) && (
          <div className="mt-3.5 rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-white">
            <div className="flex items-baseline justify-between border-b border-[rgba(0,0,0,0.06)] px-3 py-2">
              <p className="text-[11px] font-bold text-[#111110]">월별 매출 로그</p>
              {monthlyEntries.length > 0 && (
                <p className="text-[10.5px] text-[#615D59]">
                  확정 <span className="font-bold text-[#B43E3E]"><MoneyValue value={confirmedSum} /></span>
                  {targetVal ? <> / 목표 <MoneyValue value={targetVal} /></> : ""}
                </p>
              )}
            </div>
            {deal.loadingDetail ? (
              <div className="px-3 py-4">
                <div className="h-4 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-[#f0f0ec]" />
              </div>
            ) : (
              <ul className="max-h-[260px] overflow-y-auto px-1.5 py-1.5">
                {monthlyConfidence.map(({ ym, amount, confirmedAmount }) => {
                  // 헤더 확정 합계와 같은 캐논 값에서 파생 — 확정분이 1원이라도 있으면 확정 도트.
                  const confirmed = confirmedAmount > 0
                  return (
                    <li key={ym}
                      className="flex items-center justify-between rounded px-1.5 py-1 text-[12px] hover:bg-[#FAFAF8]">
                      <span className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${confirmed ? "bg-[#B43E3E]" : "bg-[#A8741A]"}`} aria-hidden="true" />
                        <span className="font-mono text-[11.5px] text-[#615D59]">{ym}</span>
                        {!confirmed && <span className="text-[10px] font-semibold text-[#A8741A]">미확정</span>}
                        {confirmed && confirmedAmount < amount && (
                          <span className="cursor-help text-[10px] font-semibold text-[#A8741A]"
                            title={`¥${cnyExact(confirmedAmount)} · 시트 원값 · 반올림 없음`}>부분 ¥{cny(confirmedAmount)}</span>
                        )}
                      </span>
                      <span className={`cursor-help font-bold ${confirmed ? "text-[#111110]" : "text-[#615D59]"}`}
                        title={`¥${cnyExact(amount)} · 시트 원값 · 반올림 없음`}>
                        ¥{cny(amount)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
