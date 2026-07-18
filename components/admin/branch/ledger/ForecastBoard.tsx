"use client"

// 주차 Forecast 보드(렌즈 "board") — Board-1b 시안 이식.
// REV 행을 "선택월 × 주차(W1~W5)" 칸반으로 재배열해 확정/고확도/예정 흐름을 카드로 검수한다.
// 데이터 산식은 매트릭스와 동일한 shared 헬퍼(rowWeeklySplit·rowMonth*)만 사용 — 별도 집계 금지.
// 주차가 없는 행(월합계만)은 실주차와 섞지 않고 전용 칼럼으로 분리해 표기한다(추정 배치와 구분).

import { useMemo, useState } from "react"
import { CalendarRange } from "lucide-react"
import { CONFIDENCE_TOKENS, type ConfidenceKey } from "@/lib/branch/confidence-tokens"
import {
  formatMoney,
  formatWeekAmount,
  formatMonthLabel,
  productCategoryMeta,
  rowMonthAmount,
  rowMonthConfirmed,
  rowMonthHighConfidence,
  rowProductCategory,
  rowWeeklySplit,
  type LedgerRevenueRow,
  type RevProductCategory,
} from "./shared"

// firstPaymentWeekIndex(ceil(day/7), 4주 상한)와 동일한 달력 구획 — 헤더 보조 라벨 전용.
export const FORECAST_WEEK_RANGE_LABELS = ["1–7일", "8–14일", "15–21일", "22–28일", "29일~"] as const

// 칼럼당 기본 노출 카드 수 — 초과분은 칼럼별 "더 보기"로 펼친다(숨김이 아니라 접힘, 건수 명시).
export const FORECAST_BOARD_COLUMN_CAP = 30

export interface ForecastBoardCard {
  rowId: string
  customer: string
  productCategory: Exclude<RevProductCategory, "all">
  amount: number
  confidence: ConfidenceKey
  /** 월 금액 중 확정 비율(0~1) — 부분 확정 카드의 하단 마이크로 바용. */
  confirmedRatio: number
  highRatio: number
  /** 주차 명시 입력이 아니라 firstPayment 일자로 추정 배치된 카드. */
  inferred: boolean
  /** 장부 입력(적용 초안) 파생 행. */
  draft: boolean
}

export interface ForecastBoardColumn {
  id: "w1" | "w2" | "w3" | "w4" | "w5" | "month-only"
  label: string
  subLabel: string
  total: number
  cards: ForecastBoardCard[]
}

export interface ForecastBoardModel {
  columns: ForecastBoardColumn[]
  monthTotal: number
  monthConfirmed: number
  monthHighConfidence: number
  monthOpen: number
  dealCount: number
}

// 확도 톤 판정 — 매트릭스 셀과 동일한 rowMonth* 산식 기반. 전액 확정(¥1 오차 허용)=확정,
// 고확도 금액 보유=고확도, 나머지=예정. 부분 확정은 톤을 올리지 않고 ratio로만 표기한다
// (부분을 '확정'으로 승격하면 셀 합산 인플레와 같은 착시를 만든다).
function cardConfidence(amount: number, confirmed: number, high: number): ConfidenceKey {
  if (confirmed >= amount - 1) return "confirmed"
  if (high > 0) return "high-confidence"
  return "expected"
}

export function buildForecastBoardModel(rows: LedgerRevenueRow[], month: string): ForecastBoardModel {
  const columns: ForecastBoardColumn[] = [
    ...([0, 1, 2, 3, 4] as const).map((index) => ({
      id: `w${index + 1}` as ForecastBoardColumn["id"],
      label: `W${index + 1}`,
      subLabel: FORECAST_WEEK_RANGE_LABELS[index],
      total: 0,
      cards: [] as ForecastBoardCard[],
    })),
    { id: "month-only", label: "월합계만", subLabel: "주차 미배정", total: 0, cards: [] },
  ]

  let monthTotal = 0
  let monthConfirmed = 0
  let monthHighConfidence = 0
  let dealCount = 0

  for (const row of rows) {
    const amount = rowMonthAmount(row, month)
    if (amount <= 0) continue
    const confirmed = rowMonthConfirmed(row, month)
    const high = rowMonthHighConfidence(row, month)
    monthTotal += amount
    monthConfirmed += confirmed
    monthHighConfidence += high
    dealCount += 1

    const base = {
      rowId: row.id,
      customer: row.customer,
      productCategory: rowProductCategory(row),
      confidence: cardConfidence(amount, confirmed, high),
      confirmedRatio: amount > 0 ? Math.min(confirmed / amount, 1) : 0,
      highRatio: amount > 0 ? Math.min(high / amount, Math.max(1 - confirmed / amount, 0)) : 0,
      draft: row.ledgerOrigin === "draft",
    }

    const split = rowWeeklySplit(row, month)
    if (split.source === "explicit" || split.source === "inferred") {
      split.weeks.forEach((value, index) => {
        if (value <= 0) return
        columns[index].total += value
        columns[index].cards.push({ ...base, amount: value, inferred: split.source === "inferred" })
      })
      continue
    }
    // month-only(또는 금액만 있는 empty 변형)는 실주차와 섞지 않는다.
    columns[5].total += amount
    columns[5].cards.push({ ...base, amount, inferred: false })
  }

  for (const column of columns) {
    column.cards.sort((a, b) => b.amount - a.amount || a.customer.localeCompare(b.customer, "ko"))
  }

  return {
    columns,
    monthTotal,
    monthConfirmed,
    monthHighConfidence,
    monthOpen: Math.max(monthTotal - monthConfirmed - monthHighConfidence, 0),
    dealCount,
  }
}

// 예정(잔여) 구간의 빗금 — Board-1b의 '예상' 해칭을 Warning 틴트 페어로 재현(팔레트 준수).
const OPEN_HATCH_BACKGROUND =
  "repeating-linear-gradient(45deg, #ECD29C, #ECD29C 4px, #FBF1E0 4px, #FBF1E0 8px)"

const CARD_TONE_CLASS: Record<ConfidenceKey, string> = {
  confirmed: "border border-[#BDEFD8] border-l-[3px] border-l-[#084734] bg-[#ECFDF5]",
  "high-confidence": "border border-[#BFDBFE] border-l-[3px] border-l-[#1E5DA8] bg-[#EFF6FF]",
  expected: "border border-dashed border-[#ECD29C] bg-white",
}

interface ForecastBoardProps {
  rows: LedgerRevenueRow[]
  selectedMonth: string
  monthOptions: Array<{ value: string; label: string }>
  onSelectMonth: (month: string) => void
  onOpenRow: (row: LedgerRevenueRow) => void
  selectedRowId?: string | null
}

export function ForecastBoard({
  rows,
  selectedMonth,
  monthOptions,
  onSelectMonth,
  onOpenRow,
  selectedRowId = null,
}: ForecastBoardProps) {
  const model = useMemo(() => buildForecastBoardModel(rows, selectedMonth), [rows, selectedMonth])
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(() => new Set())

  const confirmedPct = model.monthTotal > 0 ? Math.round((model.monthConfirmed / model.monthTotal) * 100) : 0
  const highPct = model.monthTotal > 0 ? Math.round((model.monthHighConfidence / model.monthTotal) * 100) : 0
  const openPct = Math.max(100 - confirmedPct - highPct, 0)

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="border-b border-[rgba(0,0,0,0.08)] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
              <CalendarRange className="h-4 w-4 text-[#084734]" />
              주차 Forecast 보드
              <span className="text-[11px] font-semibold text-[#615D59]">
                {formatMonthLabel(selectedMonth)} · {model.dealCount.toLocaleString("ko-KR")}행
              </span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
              선택월 금액을 주차 칸반으로 검수합니다 — 카드를 누르면 우측 빠른 작업에서 상세·주차 입력이 열립니다.
            </p>
          </div>
          <p className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#615D59]">
              {formatMonthLabel(selectedMonth)} 합계
            </span>
            <span className="text-[22px] font-bold tabular-nums tracking-[-0.01em] text-[#111110]">
              {formatMoney(model.monthTotal)}
            </span>
          </p>
        </div>

        {model.monthTotal > 0 && (
          <>
            <div className="mt-3 flex h-[10px] overflow-hidden rounded-sm border border-[rgba(0,0,0,0.08)]">
              {model.monthConfirmed > 0 && (
                <div className="bg-[#084734]" style={{ width: `${(model.monthConfirmed / model.monthTotal) * 100}%` }} />
              )}
              {model.monthHighConfidence > 0 && (
                <div className="bg-[#1E5DA8]" style={{ width: `${(model.monthHighConfidence / model.monthTotal) * 100}%` }} />
              )}
              {model.monthOpen > 0 && (
                <div className="flex-1 border-l border-dashed border-[#ECD29C]" style={{ background: OPEN_HATCH_BACKGROUND }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-[#615D59]">
              <span>
                <span className={`inline-block h-2 w-2 rounded-[2px] align-middle ${CONFIDENCE_TOKENS.confirmed.bgClass}`} />{" "}
                {CONFIDENCE_TOKENS.confirmed.label}{" "}
                <span className="font-bold tabular-nums text-[#084734]">{formatMoney(model.monthConfirmed)}</span> · {confirmedPct}%
              </span>
              <span>
                <span className={`inline-block h-2 w-2 rounded-[2px] align-middle ${CONFIDENCE_TOKENS["high-confidence"].bgClass}`} />{" "}
                {CONFIDENCE_TOKENS["high-confidence"].label}{" "}
                <span className="font-bold tabular-nums text-[#1E5DA8]">{formatMoney(model.monthHighConfidence)}</span> · {highPct}%
              </span>
              <span>
                <span
                  className="inline-block h-2 w-2 rounded-[2px] border border-[#ECD29C] align-middle"
                  style={{ background: OPEN_HATCH_BACKGROUND }}
                />{" "}
                {CONFIDENCE_TOKENS.expected.label}(잔여){" "}
                <span className="font-bold tabular-nums text-[#7A520F]">{formatMoney(model.monthOpen)}</span> · {openPct}%
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-stretch">
        <div className="flex w-[52px] flex-none flex-col border-r border-[rgba(0,0,0,0.08)]" role="tablist" aria-label="보드 월 선택">
          {monthOptions.map((month) => {
            const active = month.value === selectedMonth
            return (
              <button
                key={month.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectMonth(month.value)}
                title={formatMonthLabel(month.value)}
                className={`flex-1 border-b border-[rgba(0,0,0,0.08)] px-0 py-3 text-center text-[12px] font-bold transition last:border-b-0 ${
                  active
                    ? "border-l-2 border-l-[#084734] bg-[#ECFDF5] text-[#084734]"
                    : "text-[#A39E98] hover:bg-[#F6F5F4] hover:text-[#615D59]"
                }`}
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              >
                {Number(month.value.split("-")[1])}월
              </button>
            )
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          {model.dealCount === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
              {formatMonthLabel(selectedMonth)}에 금액이 있는 행이 없습니다 — 다른 달을 고르거나 필터를 풀어보세요.
            </div>
          ) : (
            <div className="grid min-w-[920px] grid-cols-6">
              {model.columns.map((column, columnIndex) => {
                const monthOnly = column.id === "month-only"
                const expanded = expandedColumns.has(column.id)
                const visibleCards = expanded ? column.cards : column.cards.slice(0, FORECAST_BOARD_COLUMN_CAP)
                const hiddenCount = column.cards.length - visibleCards.length
                return (
                  <div key={column.id} className={columnIndex < model.columns.length - 1 ? "border-r border-[rgba(0,0,0,0.08)]" : ""}>
                    <div
                      className={`border-b border-[rgba(0,0,0,0.08)] px-2.5 py-2 ${monthOnly ? "bg-[#FBF1E0]" : "bg-[#FAFAF8]"}`}
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className={`text-[12px] font-bold ${monthOnly ? "text-[#7A520F]" : "text-[#111110]"}`}>
                          {column.label}
                        </span>
                        <span className={`text-[9.5px] font-semibold ${monthOnly ? "text-[#A8741A]" : "text-[#A39E98]"}`}>
                          {column.subLabel}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-1">
                        <span className={`text-[11.5px] font-bold tabular-nums ${monthOnly ? "text-[#7A520F]" : "text-[#084734]"}`}>
                          {column.total > 0 ? formatWeekAmount(column.total) : "—"}
                        </span>
                        <span className="text-[9.5px] font-semibold text-[#A39E98]">
                          {column.cards.length > 0 ? `${column.cards.length.toLocaleString("ko-KR")}장` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex min-h-[220px] flex-col gap-1.5 p-2">
                      {visibleCards.length === 0 ? (
                        <p className="py-6 text-center text-[11px] font-semibold text-[#A39E98]">—</p>
                      ) : (
                        visibleCards.map((card, cardIndex) => {
                          const row = rowById.get(card.rowId)
                          const token = CONFIDENCE_TOKENS[card.confidence]
                          const partial = card.confidence !== "confirmed" && card.confirmedRatio > 0
                          const meta = productCategoryMeta(card.productCategory)
                          return (
                            <button
                              key={`${card.rowId}-${cardIndex}`}
                              type="button"
                              disabled={!row}
                              onClick={() => row && onOpenRow(row)}
                              title={[
                                `${card.customer} · ${token.label}`,
                                card.inferred ? "주차 미입력 — firstPayment 일자로 추정 배치" : null,
                                partial ? `확정 ${Math.round(card.confirmedRatio * 100)}% 포함` : null,
                                card.draft ? "장부 입력(적용 초안) 행" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              className={`rounded-md px-2 py-1.5 text-left transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 ${CARD_TONE_CLASS[card.confidence]} ${
                                selectedRowId === card.rowId ? "ring-2 ring-[#084734]/30" : ""
                              }`}
                            >
                              <span className="block truncate text-[11px] font-bold leading-tight text-[#111110]">
                                {card.customer}
                              </span>
                              <span className="mt-0.5 flex items-center justify-between gap-1">
                                <span className="flex min-w-0 items-center gap-1">
                                  <span
                                    className={`shrink-0 text-[9px] font-bold ${
                                      card.productCategory === "hardware" ? "text-[#7A520F]" : "text-[#615D59]"
                                    }`}
                                  >
                                    {meta.shortLabel}
                                  </span>
                                  {card.inferred && (
                                    <span className="shrink-0 text-[9px] font-semibold text-[#A39E98]">추정</span>
                                  )}
                                  {card.draft && (
                                    <span className="shrink-0 rounded-sm bg-[#F6F5F4] px-1 text-[8.5px] font-bold text-[#615D59]">
                                      DB
                                    </span>
                                  )}
                                </span>
                                <span className={`shrink-0 text-[11px] font-bold tabular-nums ${token.textClass}`}>
                                  {formatWeekAmount(card.amount)}
                                </span>
                              </span>
                              {partial && (
                                <span className="mt-1 flex h-[3px] overflow-hidden rounded-sm bg-[#F0F0EC]">
                                  <span className="bg-[#084734]" style={{ width: `${card.confirmedRatio * 100}%` }} />
                                  {card.highRatio > 0 && (
                                    <span className="bg-[#1E5DA8]" style={{ width: `${card.highRatio * 100}%` }} />
                                  )}
                                </span>
                              )}
                            </button>
                          )
                        })
                      )}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedColumns((prev) => {
                              const next = new Set(prev)
                              next.add(column.id)
                              return next
                            })
                          }
                          className="rounded-md border border-dashed border-[rgba(0,0,0,0.12)] px-2 py-1.5 text-[10.5px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
                        >
                          +{hiddenCount.toLocaleString("ko-KR")}장 더 보기
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <p className="border-t border-[rgba(0,0,0,0.08)] px-4 py-2.5 text-[10.5px] font-semibold text-[#A39E98]">
        확도 산식은 매트릭스와 동일(확정=녹색·고확도=파랑·예정=빗금/점선) · &lsquo;월합계만&rsquo;은 주차 미배정 행 —
        카드를 눌러 빠른 입력에서 주차를 배정하세요 · 추정=결제 시작일 기반 배치
      </p>
    </section>
  )
}
