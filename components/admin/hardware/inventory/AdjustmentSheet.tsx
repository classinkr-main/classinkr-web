"use client"

// 재고 조정(입고관리 권한자 전용) — 품목·늘림/줄임·수량·물류번호(선택)·사유(필수)를 받아
// movementType "adjust" 한 줄을 저장한다. 창고 출발·도착은 서버가 adjustDirection 으로 정한다(§7-3).
// 검증·전송 형식은 stock-admin-model.ts 가 맡는다.

import { useEffect, useId, useMemo, useState } from "react"
import { Scale, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { localDateKey } from "./inbound-sheet-model"
import { formatNumber, type HardwareItem, type HardwareStockRow } from "./shared"
import {
  adjustmentDraftIsValid,
  buildAdjustmentPayload,
  fetchHardwareLots,
  submitAdjustment,
  validateAdjustmentDraft,
  type AdjustDirection,
  type AdjustmentDraft,
  type HardwareLotsSnapshot,
} from "./stock-admin-model"

interface Props {
  // 조정할 품목 — 재고 행에서 열면 그 품목, 헤더에서 열면 null(목록에서 고른다).
  initialItemId: string | null
  items: HardwareItem[]
  stock: HardwareStockRow[]
  owner?: string | null
  onClose: () => void
  onSaved: (message: string) => void
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none transition placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:opacity-60"
const CHIP_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center rounded-md border bg-white px-3 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
const CHIP_IDLE = "border-[rgba(0,0,0,0.08)] text-[#31302E] hover:border-[rgba(0,0,0,0.2)]"
const CHIP_ACTIVE = "border-[#084734] text-[#084734] shadow-[inset_0_0_0_1px_#084734]"

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11.5px] font-semibold text-[#B43E3E]">{message}</p> : null
}

export default function AdjustmentSheet({ initialItemId, items, stock, owner, onClose, onSaved }: Props) {
  const titleId = useId()
  const [draft, setDraft] = useState<AdjustmentDraft>(() => ({
    itemId: initialItemId ?? "",
    direction: null,
    quantity: "",
    lotNo: "",
    reason: "",
    occurredAt: localDateKey(),
    owner: owner ?? "",
  }))
  const [lots, setLots] = useState<{ itemId: string; snapshot: HardwareLotsSnapshot | null } | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const item = useMemo(() => items.find((candidate) => candidate.id === draft.itemId) ?? null, [draft.itemId, items])
  const stockRow = useMemo(() => stock.find((row) => row.itemId === draft.itemId) ?? null, [draft.itemId, stock])
  const lotTracked = item?.lot_tracked !== false
  const lotSnapshot = lots && lots.itemId === draft.itemId ? lots.snapshot : null
  const validation = useMemo(() => validateAdjustmentDraft(draft, { item, lots: lotSnapshot }), [draft, item, lotSnapshot])

  // 물류번호 관리 품목이면 품목별 잔여를 받아 온다. 실패하면 재고 행의 물류번호 칩(같은 해석기)으로 대신한다.
  useEffect(() => {
    if (!item || item.lot_tracked === false) return
    let cancelled = false
    fetchHardwareLots(adminFetchJson, item.id)
      .then((snapshot) => {
        if (!cancelled) setLots({ itemId: item.id, snapshot })
      })
      .catch(() => {
        if (!cancelled) setLots({ itemId: item.id, snapshot: null })
      })
    return () => {
      cancelled = true
    }
  }, [item])

  const lotOptions = useMemo(() => {
    if (!lotTracked) return []
    if (lotSnapshot) return lotSnapshot.lots.map((lot) => ({ lotNo: lot.lotNo, remaining: lot.remaining }))
    return (stockRow?.lotBalances ?? []).map((lot) => ({ lotNo: lot.lot, remaining: lot.quantity }))
  }, [lotSnapshot, lotTracked, stockRow])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || saving) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose, saving])

  const update = (patch: Partial<AdjustmentDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError(null)
  }

  const save = async () => {
    if (saving) return
    setAttempted(true)
    setError(null)
    if (!item || !adjustmentDraftIsValid(validation)) return
    const payload = buildAdjustmentPayload(draft, item)
    if (!payload) return
    setSaving(true)
    try {
      await submitAdjustment(adminFetchJson, payload)
      onSaved(
        `${item.name} 재고를 ${formatNumber(payload.quantity)}대 ${payload.adjustDirection === "increase" ? "늘렸" : "줄였"}습니다${
          payload.lotNo ? ` (${payload.lotNo})` : ""
        } · 사유: ${payload.memo}`
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "재고 조정을 저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const errors = attempted ? validation.errors : {}
  const directionChoices: Array<{ value: AdjustDirection; label: string }> = [
    { value: "increase", label: "늘림 (+)" },
    { value: "decrease", label: "줄임 (−)" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:items-center" onClick={() => !saving && onClose()}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
          <div>
            <h2 id={titleId} className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
              <Scale className="h-4 w-4 text-[#615D59]" aria-hidden />
              재고 조정
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">실사 차이·파손·분실처럼 입고·출고가 아닌 차이만 기록합니다. 사유는 필수입니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="재고 조정 닫기"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset disabled={saving} className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto border-0 px-5 py-4">
            <label className="block">
              <span className="text-[11px] font-bold text-[#615D59]">품목</span>
              <select
                value={draft.itemId}
                onChange={(event) => update({ itemId: event.target.value, lotNo: "" })}
                aria-invalid={errors.item ? true : undefined}
                className={`mt-1 ${INPUT_CLASS}`}
              >
                <option value="">품목을 고르세요</option>
                {items.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              {stockRow ? (
                <p className="mt-1 text-[11.5px] tabular-nums text-[#615D59]">
                  지금 창고 {formatNumber(stockRow.warehouseStock)}대 · 가용 {formatNumber(stockRow.availableStock)}대
                </p>
              ) : null}
              <FieldError message={errors.item} />
            </label>

            <div>
              <span className="text-[11px] font-bold text-[#615D59]">방향</span>
              <div role="group" aria-label="조정 방향" className="mt-1 flex gap-1.5">
                {directionChoices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={draft.direction === choice.value}
                    onClick={() => update({ direction: choice.value })}
                    className={`${CHIP_CLASS} ${draft.direction === choice.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <FieldError message={errors.direction} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-bold text-[#615D59]">수량</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.quantity}
                  onChange={(event) => update({ quantity: event.target.value })}
                  aria-invalid={errors.quantity ? true : undefined}
                  placeholder="0"
                  autoComplete="off"
                  className={`mt-1 ${INPUT_CLASS} text-right font-semibold tabular-nums`}
                />
                <FieldError message={errors.quantity} />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#615D59]">조정일</span>
                <input
                  type="date"
                  value={draft.occurredAt}
                  onChange={(event) => update({ occurredAt: event.target.value })}
                  aria-invalid={errors.date ? true : undefined}
                  className={`mt-1 ${INPUT_CLASS} tabular-nums`}
                />
                <FieldError message={errors.date} />
              </label>
            </div>

            {item && lotTracked ? (
              <label className="block">
                <span className="text-[11px] font-bold text-[#615D59]">물류번호 (선택)</span>
                <select value={draft.lotNo} onChange={(event) => update({ lotNo: event.target.value })} className={`mt-1 ${INPUT_CLASS}`}>
                  <option value="">물류번호 없이 조정</option>
                  {lotOptions.map((lot) => (
                    <option key={lot.lotNo} value={lot.lotNo}>
                      {lot.lotNo} · 잔여 {formatNumber(lot.remaining)}대
                    </option>
                  ))}
                </select>
                <FieldError message={errors.lot} />
              </label>
            ) : item ? (
              <p className="text-[11.5px] text-[#615D59]">이 품목은 물류번호를 관리하지 않아 수량만 조정합니다.</p>
            ) : null}

            <label className="block">
              <span className="text-[11px] font-bold text-[#615D59]">사유 (필수)</span>
              <textarea
                value={draft.reason}
                onChange={(event) => update({ reason: event.target.value })}
                aria-invalid={errors.reason ? true : undefined}
                rows={2}
                placeholder="예: 10/28 오산 창고 실사 — 2대 부족"
                className="mt-1 w-full resize-y rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
              />
              <FieldError message={errors.reason} />
            </label>

            {validation.warnings.map((warning) => (
              <p key={warning} className="border-l-2 border-[#A8741A] pl-2.5 text-[12px] text-[#7A520F]">
                {warning}
              </p>
            ))}
          </fieldset>
          <div className="border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-4">
            {error ? (
              <p role="alert" className="mb-2 border-l-2 border-[#B43E3E] pl-2.5 text-[12px] font-semibold text-[#8F2C2C]">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:opacity-60"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:opacity-60"
              >
                {saving ? "저장 중…" : "조정 저장"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
