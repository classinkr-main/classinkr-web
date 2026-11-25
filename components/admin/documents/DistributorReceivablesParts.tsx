import type {
  ReceivableAgeBucket,
  ReceivableMonthPoint,
  ReceivableStatusFilter,
  ReceivableSummary,
} from "@/lib/distributor-receivables-view"

import { formatWon } from "./distributor-ui"

// 총판 미수금 보드의 표시 조각(요약 타일 · 경과 구간 막대 · 월별 흐름). 계산은 lib/distributor-receivables-view.ts 가 한다.

/* ─── 요약 타일 ──────────────────────────────────────────── */

function formatRate(rate: number | null): string {
  if (rate == null) return "—"
  return `${(Math.round(rate * 1000) / 10).toString()}%`
}

export function ReceivableSummaryTiles({
  summary,
  status,
  onPickStatus,
}: {
  summary: ReceivableSummary
  status: ReceivableStatusFilter
  onPickStatus: (status: ReceivableStatusFilter) => void
}) {
  const tiles: Array<{
    key: string
    filter: ReceivableStatusFilter
    label: string
    amount: number
    sub: string
    tone: string
  }> = [
    {
      key: "open",
      filter: "open",
      label: "받을 금액",
      amount: summary.openAmount,
      sub: `${summary.openCount}건`,
      tone: "text-[#111110]",
    },
    {
      key: "overdue",
      filter: "overdue",
      label: "기한 경과",
      amount: summary.overdueAmount,
      sub: `${summary.overdueCount}건`,
      tone: summary.overdueCount > 0 ? "text-[#B43E3E]" : "text-[#111110]",
    },
    {
      key: "due_missing",
      filter: "due_missing",
      label: "기한 미입력",
      amount: summary.dueMissingAmount,
      sub: `${summary.dueMissingCount}건`,
      tone: summary.dueMissingCount > 0 ? "text-[#7A520F]" : "text-[#111110]",
    },
    {
      key: "paid",
      filter: "all",
      label: "입금 누계",
      amount: summary.paidAmount,
      sub: `회수율 ${formatRate(summary.collectionRate)}`,
      tone: "text-[#084734]",
    },
  ]

  return (
    <div className="border-b border-[#e8e8e4] px-5 py-4">
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const active = status === tile.filter
          return (
            <li key={tile.key}>
              <button
                type="button"
                onClick={() => onPickStatus(tile.filter)}
                aria-pressed={active}
                className={`block min-h-9 w-full rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
                  active ? "border-[#084734] bg-[#F6F5F4]" : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4]"
                }`}
              >
                <span className="block text-[11.5px] font-semibold text-[#78736D]">{tile.label}</span>
                <span className={`mt-1 block text-lg font-bold tabular-nums sm:text-xl ${tile.tone}`}>{formatWon(tile.amount)}</span>
                <span className="block text-[11.5px] tabular-nums text-[#78736D]">{tile.sub}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {summary.dueMissingCount > 0 && (
        <p className="mt-2 text-[12px] text-[#7A520F]">
          기한이 없으면 기한 경과로 잡히지 않습니다. 기한 미입력 {summary.dueMissingCount}건은 견적의 총판 정산에서 입금 기한을 정해 주세요.
        </p>
      )}
    </div>
  )
}

/* ─── 경과 구간 막대 ─────────────────────────────────────── */

// 오래될수록 무겁게 — 웜 뉴트럴 → Warning → Danger(DESIGN.md 운영 상태 스케일 값).
const BUCKET_COLORS: Record<ReceivableAgeBucket, string> = {
  d0_30: "#A39E98",
  d31_60: "#A8741A",
  d61_90: "#7A520F",
  d91_plus: "#B43E3E",
}

export function ReceivableAgeBar({
  buckets,
  selected,
  onPick,
}: {
  buckets: ReceivableSummary["buckets"]
  selected: ReceivableAgeBucket | null
  onPick: (bucket: ReceivableAgeBucket | null) => void
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0)

  return (
    <div className="border-b border-[#e8e8e4] px-5 py-4">
      <h3 className="text-[12.5px] font-bold text-[#111110]">발행 후 경과 구간별 받을 금액</h3>
      {total <= 0 ? (
        <p className="mt-2 text-[12.5px] text-[#615D59]">받을 금액이 없어 경과 구간을 나눌 건이 없습니다.</p>
      ) : (
        <>
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-[#f0f0ec]" aria-hidden="true">
            {buckets.map((bucket) =>
              bucket.amount > 0 ? (
                <button
                  key={bucket.bucket}
                  type="button"
                  tabIndex={-1}
                  onClick={() => onPick(selected === bucket.bucket ? null : bucket.bucket)}
                  style={{
                    width: `${(bucket.amount / total) * 100}%`,
                    backgroundColor: BUCKET_COLORS[bucket.bucket],
                    opacity: selected && selected !== bucket.bucket ? 0.35 : 1,
                  }}
                  className="h-full border-r border-white last:border-r-0"
                />
              ) : null
            )}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
            {buckets.map((bucket) => {
              const active = selected === bucket.bucket
              return (
                <li key={bucket.bucket}>
                  <button
                    type="button"
                    onClick={() => onPick(active ? null : bucket.bucket)}
                    aria-pressed={active}
                    disabled={bucket.count === 0 && !active}
                    className={`flex min-h-9 w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-60 ${
                      active ? "border-[#084734] bg-[#F6F5F4]" : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: BUCKET_COLORS[bucket.bucket] }}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#31302E]">{bucket.label}</span>
                      <span className="block tabular-nums text-[#615D59]">
                        {formatWon(bucket.amount)} · {bucket.count}건
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

/* ─── 월별 흐름 ──────────────────────────────────────────── */

function monthLabel(month: string): string {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`
}

export function ReceivableMonthlyFlow({
  points,
  selectedMonth,
  onPick,
}: {
  points: ReceivableMonthPoint[]
  selectedMonth: string | null
  onPick: (month: string | null) => void
}) {
  const max = points.reduce((acc, point) => Math.max(acc, point.issuedAmount, point.collectedAmount), 0)
  const pct = (value: number) => (max > 0 ? `${Math.max(value > 0 ? 2 : 0, (value / max) * 100)}%` : "0%")

  return (
    <div className="border-b border-[#e8e8e4] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-bold text-[#111110]">최근 6개월 청구 발행 · 입금</h3>
        <p className="text-[11.5px] text-[#78736D]">달을 누르면 그 달에 발행한 건만 봅니다.</p>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((point) => {
          const active = selectedMonth === point.month
          return (
            <li key={point.month}>
              <button
                type="button"
                onClick={() => onPick(active ? null : point.month)}
                aria-pressed={active}
                aria-label={`${monthLabel(point.month)} — 청구 발행 ${formatWon(point.issuedAmount)}, 입금 ${formatWon(point.collectedAmount)}${active ? " (선택됨)" : ""}`}
                className={`block min-h-9 w-full rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] ${
                  active ? "border-[#084734] bg-[#F6F5F4]" : "border-transparent hover:bg-[#FAFAF8]"
                }`}
              >
                <span className="block text-[11.5px] font-semibold text-[#31302E]">{monthLabel(point.month)}</span>
                <span className="mt-0.5 grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-2 gap-y-1 text-[11.5px] tabular-nums">
                  <span className="text-[#78736D]">발행</span>
                  <span className="h-2 rounded-sm bg-[#f0f0ec]" aria-hidden="true">
                    <span className="block h-full rounded-sm bg-[#A39E98]" style={{ width: pct(point.issuedAmount) }} />
                  </span>
                  <span className="text-right text-[#31302E]">{formatWon(point.issuedAmount)}</span>
                  <span className="text-[#78736D]">입금</span>
                  <span className="h-2 rounded-sm bg-[#f0f0ec]" aria-hidden="true">
                    <span className="block h-full rounded-sm bg-[#084734]" style={{ width: pct(point.collectedAmount) }} />
                  </span>
                  <span className="text-right text-[#084734]">{formatWon(point.collectedAmount)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
