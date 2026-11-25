"use client"

import type { Dispatch, SetStateAction } from "react"
import { Minus, Plus } from "lucide-react"
import CustomerPicker from "./CustomerPicker"
import ProductPicker from "./ProductPicker"
import { formatNumber, type HardwareDashboard } from "./shared"
import { previewHomeRecord, type HomeRecordDraft } from "./home-record-model"

interface Props {
  data: HardwareDashboard | null
  draft: HomeRecordDraft
  setDraft: Dispatch<SetStateAction<HomeRecordDraft>>
  customers: string[]
  disabled: boolean
  onReview: (draft: HomeRecordDraft) => void
  /** 입고는 입고관리 권한자만(정의서 §권한). 생략(구응답) = 연다. */
  canInbound?: boolean
}

const MODES = [{ key: "inbound", label: "입고" }, { key: "sale", label: "출고" }, { key: "planned", label: "예정" }] as const
const FIELD = "h-10 w-full rounded-md border border-[rgba(0,0,0,0.14)] bg-white px-3 text-[13px] text-[#111110]"
const LABEL = "text-[11px] font-semibold text-[#615D59]"

export default function HomeQuickRecord({ data, draft, setDraft, customers, disabled, onReview, canInbound = true }: Props) {
  const modes = canInbound ? MODES : MODES.filter(mode => mode.key !== "inbound")
  const item = data?.items.find(item => item.id === draft.itemId)
  const row = data?.stock.find(row => row.itemId === draft.itemId)
  const quantity = Number(draft.quantity)
  const preview = row ? previewHomeRecord(row, draft.preset, quantity) : null
  const mode = modes.find(mode => mode.key === draft.preset) ?? modes[0]
  const party = draft.preset === "inbound" ? draft.source ?? "" : draft.customer
  const valid = Boolean(item && preview && draft.date && (canInbound || draft.preset !== "inbound") && (draft.preset === "inbound" || draft.customer.trim()))
  const update = (patch: Partial<HomeRecordDraft>) => setDraft(current => ({ ...current, ...patch }))

  return (
    <section id="hardware-home-quick-record" aria-label="빠른 입출고 입력" className="scroll-mt-6 space-y-3 rounded-[10px] border-[1.5px] border-[#084734] bg-white px-4 py-4 sm:px-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-bold text-[#111110]">새 기록</h2>
        <span className="text-[12px] text-[#615D59]">Enter로 검토 · Tab으로 다음 칸</span>
      </div>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (valid && !disabled) onReview(draft) }}>
        <fieldset disabled={disabled} className="flex min-w-0 flex-wrap items-end gap-2.5 disabled:opacity-50">
          <legend className="sr-only">입출고 내용</legend>
          <div className="flex shrink-0 flex-col gap-1">
            <span className={LABEL}>유형</span>
            {/* 높이는 버튼이 정한다 — 모바일 래퍼가 버튼을 44px 로 올리므로 컨테이너 고정 높이는 잘린다. */}
            <div className="inline-flex overflow-hidden rounded-md border border-[rgba(0,0,0,0.14)]" role="group" aria-label="빠른 기록 유형">
              {modes.map(mode => <button key={mode.key} type="button" aria-pressed={draft.preset === mode.key} onClick={() => update({ preset: mode.key })} className={`h-10 border-r border-[rgba(0,0,0,0.1)] bg-white px-3.5 text-[13px] last:border-r-0 ${draft.preset === mode.key ? "font-bold text-[#084734] shadow-[inset_0_-2px_0_#084734]" : "text-[#31302E]"}`}>{mode.label}</button>)}
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
            <span className={LABEL}>제품</span>
            <div className="[&_button]:mt-0 [&_button]:h-10 [&_button]:min-h-11 md:[&_button]:min-h-10"><ProductPicker items={data?.items ?? []} value={draft.itemId} onChange={itemId => update({ itemId })} ariaLabel="빠른 기록 제품" disabled={disabled} /></div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <label htmlFor="hardware-home-quantity" className={LABEL}>수량</label>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="빠른 기록 수량 줄이기" disabled={disabled || quantity <= 1} onClick={() => update({ quantity: String(Math.max(1, (Number.isFinite(quantity) ? quantity : 1) - 1)) })} className="h-10 w-10 shrink-0 rounded-md border border-[rgba(0,0,0,0.14)] disabled:opacity-40"><Minus className="mx-auto h-3.5 w-3.5" /></button>
              <input id="hardware-home-quantity" type="number" min="1" step="1" required className="h-10 w-16 shrink-0 rounded-md border border-[rgba(0,0,0,0.14)] bg-white px-1 text-center text-[13px] font-bold tabular-nums text-[#111110]" value={draft.quantity} onChange={event => update({ quantity: event.target.value })} />
              <button type="button" aria-label="빠른 기록 수량 늘리기" onClick={() => update({ quantity: String((Number.isFinite(quantity) ? quantity : 0) + 1) })} className="h-10 w-10 shrink-0 rounded-md border border-[rgba(0,0,0,0.14)]"><Plus className="mx-auto h-3.5 w-3.5" /></button>
              <span className="text-[12px] text-[#615D59]">대</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
            <span className={LABEL}>{draft.preset === "inbound" ? "공급사" : "고객사"}</span>
            <CustomerPicker value={party} onChange={value => update(draft.preset === "inbound" ? { source: value } : { customer: value })} options={draft.preset === "inbound" ? [] : customers} ariaLabel="빠른 기록 거래처" disabled={disabled} className={FIELD} placeholder={draft.preset === "inbound" ? "공급사 또는 출발지 (선택)" : "고객 검색 또는 입력"} />
          </div>
          <div className="flex min-w-0 flex-[1_1_150px] flex-col gap-1 sm:flex-[0_0_150px]">
            <label htmlFor="hardware-home-date" className={LABEL}>{draft.preset === "planned" ? "배송 예정일" : "날짜"}</label>
            <input id="hardware-home-date" type="date" required className={`${FIELD} tabular-nums`} value={draft.date} onChange={event => update({ date: event.target.value })} />
          </div>
          <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-1">
            <label htmlFor="hardware-home-memo" className={LABEL}>메모</label>
            <input id="hardware-home-memo" type="text" aria-label="빠른 기록 메모" placeholder="선택" className={FIELD} value={draft.memo} onChange={event => update({ memo: event.target.value })} />
          </div>
          {/* 폼 전체 비활성은 fieldset 이 흐린다 — 두 번 흐리지 않는다 */}
          <button type="submit" disabled={disabled || !valid} className={`h-10 w-full shrink-0 rounded-md bg-[#084734] px-5 text-[13px] font-bold text-white hover:bg-[#065C41] sm:w-auto ${disabled ? "" : "disabled:opacity-40"}`}>{mode.label} 내용 검토</button>
        </fieldset>
        {/* 한 줄 미리보기 — 저장 전 예상 재고 변화 */}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-[#615D59]" aria-live="polite" aria-label="재고 변화 미리보기">
          {preview && row ? <>
            <span className="text-[#31302E]">{item?.name} {formatNumber(quantity)}대</span>
            <span className={`font-bold tabular-nums ${preview.available < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}>가용 {formatNumber(row.availableStock)} → {formatNumber(preview.available)}대</span>
            <span className="tabular-nums">· 창고 {formatNumber(row.warehouseStock)} → {formatNumber(preview.warehouse)} · 예정 {formatNumber(row.plannedOut)} → {formatNumber(preview.planned)}대</span>
            {draft.preset !== "inbound" && preview.available < 0 ? <span className="font-semibold text-[#B43E3E]">가용 재고 초과 · 상세 검토가 필요합니다.</span> : null}
          </> : <span>{!item ? "제품을 선택하면 재고 변화가 보입니다" : !row ? "재고 정보가 없는 품목입니다" : "수량을 1 이상 정수로 입력하세요"}</span>}
          <span className="ml-auto text-[11px]">상세 검토에서 물류번호·금액 확인</span>
        </p>
      </form>
    </section>
  )
}
