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
}

const MODES = [{ key: "inbound", label: "입고" }, { key: "sale", label: "출고" }, { key: "planned", label: "예정" }] as const
const FIELD = "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110]"

export default function HomeQuickRecord({ data, draft, setDraft, customers, disabled, onReview }: Props) {
  const item = data?.items.find(item => item.id === draft.itemId)
  const row = data?.stock.find(row => row.itemId === draft.itemId)
  const quantity = Number(draft.quantity)
  const preview = row ? previewHomeRecord(row, draft.preset, quantity) : null
  const mode = MODES.find(mode => mode.key === draft.preset)!
  const party = draft.preset === "inbound" ? draft.source ?? "" : draft.customer
  const valid = Boolean(item && preview && draft.date && (draft.preset === "inbound" || draft.customer.trim()))
  const update = (patch: Partial<HomeRecordDraft>) => setDraft(current => ({ ...current, ...patch }))

  return (
    <aside id="hardware-home-quick-record" aria-label="빠른 입출고 입력" className="scroll-mt-6 border border-[rgba(0,0,0,0.08)] bg-white xl:sticky xl:top-6">
      <div className="flex items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.08)] px-4 py-4">
        <h2 className="text-[16px] font-bold text-[#111110]">빠른 기록</h2>
        <span className="text-[11px] text-[#615D59]">저장 전 입력</span>
      </div>
      <form className="space-y-3 p-4" onSubmit={event => { event.preventDefault(); if (valid && !disabled) onReview(draft) }}>
        <fieldset disabled={disabled} className="grid gap-2 disabled:opacity-50">
          <legend className="sr-only">입출고 내용</legend>
          <div className="flex border-b border-[rgba(0,0,0,0.08)]" role="group" aria-label="빠른 기록 유형">
            {MODES.map(mode => <button key={mode.key} type="button" aria-pressed={draft.preset === mode.key} onClick={() => update({ preset: mode.key })} className={`flex-1 border-b-2 py-1.5 text-[13px] font-semibold ${draft.preset === mode.key ? "border-[#084734] text-[#084734]" : "border-transparent text-[#615D59]"}`}>{mode.label}</button>)}
          </div>
          <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2"><p className="text-[12px] font-semibold text-[#615D59]">제품</p><div className="[&_button]:h-10 [&_button]:min-h-11 md:[&_button]:min-h-10"><ProductPicker items={data?.items ?? []} value={draft.itemId} onChange={itemId => update({ itemId })} ariaLabel="빠른 기록 제품" disabled={disabled} /></div></div>
          <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2">
            <label htmlFor="hardware-home-quantity" className="text-[12px] font-semibold text-[#615D59]">수량</label>
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" aria-label="빠른 기록 수량 줄이기" disabled={disabled || quantity <= 1} onClick={() => update({ quantity: String(Math.max(1, (Number.isFinite(quantity) ? quantity : 1) - 1)) })} className="h-10 w-10 rounded-md border border-[rgba(0,0,0,0.08)] disabled:opacity-40"><Minus className="mx-auto h-3.5 w-3.5" /></button>
              <input id="hardware-home-quantity" type="number" min="1" step="1" required className={`${FIELD} min-w-0 flex-1 text-center tabular-nums`} value={draft.quantity} onChange={event => update({ quantity: event.target.value })} />
              <button type="button" aria-label="빠른 기록 수량 늘리기" onClick={() => update({ quantity: String((Number.isFinite(quantity) ? quantity : 0) + 1) })} className="h-10 w-10 rounded-md border border-[rgba(0,0,0,0.08)]"><Plus className="mx-auto h-3.5 w-3.5" /></button>
              <span className="text-[12px] text-[#615D59]">대</span>
            </div>
          </div>
          <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2"><p className="text-[12px] font-semibold text-[#615D59]">{draft.preset === "inbound" ? "공급사" : "고객사"}</p><CustomerPicker value={party} onChange={value => update(draft.preset === "inbound" ? { source: value } : { customer: value })} options={draft.preset === "inbound" ? [] : customers} ariaLabel="빠른 기록 거래처" disabled={disabled} className={FIELD} placeholder={draft.preset === "inbound" ? "공급사 또는 출발지 (선택)" : "고객 검색 또는 입력"} /></div>
          <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2"><label htmlFor="hardware-home-date" className="text-[12px] font-semibold text-[#615D59]">{draft.preset === "planned" ? "출고 예정일" : "일자"}</label><input id="hardware-home-date" type="date" required className={FIELD} value={draft.date} onChange={event => update({ date: event.target.value })} /></div>
          <details className="text-[12px] text-[#615D59]"><summary className="cursor-pointer py-1">메모 추가</summary><textarea aria-label="빠른 기록 메모" rows={2} className={`${FIELD} mt-2 h-auto py-2`} value={draft.memo} onChange={event => update({ memo: event.target.value })} /></details>
        </fieldset>
        <div className="space-y-2 rounded-md bg-[#F6F5F4] p-3 text-[12px]" aria-live="polite" aria-label="재고 변화 미리보기">
          <p className="font-semibold text-[#615D59]">{mode.label} 미리보기 · 저장 전 예상</p>
          <p className="text-[#31302E]">{item?.name ?? "제품을 선택하세요"} · {Number.isSafeInteger(quantity) && quantity > 0 ? formatNumber(quantity) : "-"}대{party.trim() ? ` · ${party.trim()}` : ""}</p>
          {preview && row ? <>
            <p className={`font-bold tabular-nums ${preview.available < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}>가용 {formatNumber(row.availableStock)} → {formatNumber(preview.available)}대</p>
            <details className="text-[11px] text-[#615D59]"><summary className="cursor-pointer">창고·예정 변화</summary><p className="mt-1">창고 {formatNumber(row.warehouseStock)} → {formatNumber(preview.warehouse)} · 예정 {formatNumber(row.plannedOut)} → {formatNumber(preview.planned)}대</p></details>
            {draft.preset !== "inbound" && preview.available < 0 ? <p className="text-[11px] text-[#B43E3E]">가용 재고 초과 · 상세 검토가 필요합니다.</p> : null}
          </> : null}
        </div>
        <button type="submit" disabled={disabled || !valid} className="h-11 w-full rounded-md bg-[#084734] text-[13px] font-semibold text-white hover:bg-[#065C41] disabled:opacity-40">{mode.label} 내용 검토</button>
        <p className="text-[11px] leading-relaxed text-[#615D59]">상세 검토 후 저장 · 로트·금액 확인</p>
      </form>
    </aside>
  )
}
