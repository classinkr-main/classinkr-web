"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { planBulkApply, planBulkCheck } from "./draft-bulk-plan"
import { productLabel } from "./ledger-simple-logic"
import type { DraftConfidence, LedgerDraft, LedgerRevenueRow } from "./shared"

// 장부(A안) 입력·수정 — 시안 1(칸에서 금액·확도만 바로) + 시안 3(확인·반영을 하단 한 줄로).
// 저장은 워크벤치의 onCommitCell(매트릭스 칸 커밋과 같은 경로: 셀당 초안 1건, 같은 칸 재편집은 PATCH,
// 자가 체크)로, 확인·반영은 체크 큐의 checkDrafts/applyDrafts 로 간다 — 새 저장 경로를 만들지 않는다.

/** 워크벤치가 넘기는 칸 편집 계약. rowId·month 는 매트릭스 좌표와 같다(주차 없음 = 월 칸). */
export interface LedgerCellEditApi {
  editable: (row: LedgerRevenueRow, month: string) => boolean
  value: (row: LedgerRevenueRow, month: string) => number
  confidence: (row: LedgerRevenueRow, month: string) => DraftConfidence
  pending: (row: LedgerRevenueRow, month: string) => { amount: number } | null
  commit: (rowId: string, month: string, amount: number, confidence: DraftConfidence) => Promise<boolean>
}

const CONFIDENCE_KEYS: Array<{ id: DraftConfidence; key: string; label: string; keys: string[] }> = [
  { id: "expected", key: "E", label: "예정", keys: ["e", "ㄷ"] },
  { id: "high-confidence", key: "H", label: "고확도", keys: ["h", "ㅗ"] },
  { id: "confirmed", key: "C", label: "확정", keys: ["c", "ㅊ"] },
]

export function confidenceFromKey(key: string): DraftConfidence | null {
  const lower = key.toLowerCase()
  return CONFIDENCE_KEYS.find((item) => item.keys.includes(lower))?.id ?? null
}

/** 입력 문자열 → 원 단위 정수(¥·콤마·공백 무시). 숫자가 없으면 null. 음수는 받지 않는다(감액은 상세 입력). */
export function parseAmountInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "")
  return digits ? Number(digits) : null
}

function Swatch({ kind }: { kind: DraftConfidence }) {
  if (kind === "expected") {
    return <span aria-hidden className="inline-block h-2.5 w-2.5 border-[1.5px] border-dashed" style={{ borderColor: CONFIDENCE_TOKENS.expected.color }} />
  }
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 ${CONFIDENCE_TOKENS[kind].bgClass}`} />
}

export interface CellEditTarget {
  customer: string
  month: string
  monthLabel: string
  candidates: LedgerRevenueRow[]
  anchor: DOMRect
}

export function CellEditPopover({ target, edit, onClose, onMore }: {
  target: CellEditTarget
  edit: LedgerCellEditApi
  onClose: () => void
  onMore: (row: LedgerRevenueRow) => void
}) {
  const [row, setRow] = useState<LedgerRevenueRow | null>(target.candidates.length === 1 ? target.candidates[0] : null)
  const initialValue = row ? edit.value(row, target.month) : 0
  const [amount, setAmount] = useState(() => (initialValue > 0 ? initialValue.toLocaleString("en-US") : ""))
  const [confidence, setConfidence] = useState<DraftConfidence>(() => (row ? edit.confidence(row, target.month) : "expected"))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (row) inputRef.current?.focus()
  }, [row])
  // 표가 스크롤되면 고정 위치 창이 칸에서 떨어진다 — 따라가지 않고 닫는다.
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [onClose])

  const pick = (next: LedgerRevenueRow) => {
    const value = edit.value(next, target.month)
    setRow(next)
    setAmount(value > 0 ? value.toLocaleString("en-US") : "")
    setConfidence(edit.confidence(next, target.month))
  }

  const save = async () => {
    if (!row || saving) return
    const parsed = parseAmountInput(amount)
    if (parsed === null) return
    if (parsed === initialValue && confidence === edit.confidence(row, target.month)) {
      onClose()
      return
    }
    setSaving(true)
    const ok = await edit.commit(row.id, target.month, parsed, confidence)
    setSaving(false)
    if (ok) onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }
    // 딜 고르기 단계에서는 Enter·글자 키를 버튼에 그대로 둔다.
    if (!row) return
    if (event.key === "Enter") {
      event.preventDefault()
      void save()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const next = confidenceFromKey(event.key)
    if (next) {
      event.preventDefault()
      setConfidence(next)
    }
  }

  const width = 300
  const left = Math.max(8, Math.min(target.anchor.right - width, (typeof window === "undefined" ? 1280 : window.innerWidth) - width - 8))
  const top = target.anchor.bottom + 6

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-label={`${target.customer} ${target.monthLabel} 수정`}
        onKeyDown={onKeyDown}
        className="fixed z-50 flex flex-col gap-3 rounded-xl border border-[#37352F] bg-white p-4 text-left shadow-[0_12px_32px_rgba(17,17,16,0.14)]"
        style={{ top, left, width }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13.5px] font-bold text-[#111110]">{target.customer} · {target.monthLabel}</span>
          {row && target.candidates.length > 1 ? (
            <button type="button" onClick={() => setRow(null)} className="shrink-0 text-[12px] text-[#084734] underline-offset-2 hover:underline">딜 바꾸기</button>
          ) : null}
        </div>

        {!row ? (
          <div className="flex flex-col gap-1" role="group" aria-label="고칠 딜 선택">
            <span className="text-[12px] text-[#615D59]">이 칸에 딜이 여러 건입니다 — 고칠 딜을 고르세요</span>
            {target.candidates.map((candidate, index) => {
              const value = edit.value(candidate, target.month)
              return (
                <button
                  key={candidate.id}
                  type="button"
                  autoFocus={index === 0}
                  onClick={() => pick(candidate)}
                  className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-[rgba(0,0,0,0.1)] px-3 text-left text-[13px] hover:border-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
                >
                  <span className="min-w-0 truncate">{productLabel(candidate)}{candidate.productVersion ? ` · ${candidate.productVersion}` : ""}</span>
                  <span className="shrink-0 tabular-nums text-[#615D59]">{value > 0 ? `¥${cny(value)}` : "비어 있음"}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-[12px] text-[#615D59]">
              금액 (¥)
              <input
                ref={inputRef}
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className="h-10 rounded-lg border border-[rgba(0,0,0,0.15)] px-3 text-right text-[16px] tabular-nums text-[#111110] outline-none focus:border-[#084734]"
              />
            </label>
            <div role="group" aria-label="확도" className="grid grid-cols-3 gap-1.5">
              {CONFIDENCE_KEYS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={confidence === item.id}
                  onClick={() => setConfidence(item.id)}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25 ${confidence === item.id ? "border-[#084734] font-semibold text-[#084734] shadow-[inset_0_0_0_1px_#084734]" : "border-[rgba(0,0,0,0.12)] text-[#37352F]"}`}
                >
                  <Swatch kind={item.id} />{item.label}<kbd className="font-mono text-[10.5px] text-[#8A857D]">{item.key}</kbd>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => onMore(row)} className="text-[12px] text-[#615D59] underline-offset-2 hover:text-[#111110] hover:underline">
                주차·메모 더 보기
              </button>
              <button
                type="button"
                disabled={saving || parseAmountInput(amount) === null}
                onClick={() => void save()}
                className="min-h-9 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white transition hover:bg-[#065c41] disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장 ↵"}
              </button>
            </div>
            {initialValue > 0 ? <span className="text-[11.5px] text-[#8A857D]">지금 ¥{cnyExact(initialValue)} · 저장하면 확인된 변경으로 아래 줄에 쌓입니다</span> : null}
          </>
        )}
      </div>
    </>
  )
}

/** 시안 3 — 대기 중인 변경을 화면 아래 한 줄로. 확인·반영은 체크 큐와 같은 일괄 함수, 반영은 한 번 더 묻는다. */
export function ApprovalBar({ drafts, serverQueue, onCheck, onApply, onShowAll }: {
  drafts: LedgerDraft[]
  serverQueue: boolean
  onCheck: (ids: string[]) => Promise<{ done: number; failed: number }>
  onApply: (ids: string[]) => Promise<{ done: number; failed: number }>
  onShowAll: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const checkPlan = planBulkCheck(drafts)
  const applyPlan = planBulkApply(drafts)
  const total = drafts.reduce((sum, draft) => sum + (Number.isFinite(draft.amount) ? draft.amount : 0), 0)

  if (drafts.length === 0 && !result) return null

  const run = async (action: "check" | "apply") => {
    setBusy(true)
    try {
      const outcome = action === "check" ? await onCheck(checkPlan.ids) : await onApply(applyPlan.ids)
      const verb = action === "check" ? "확인" : "반영"
      setResult(outcome.failed > 0 ? `${outcome.done}건 ${verb}, ${outcome.failed}건 실패 — 모두 보기에서 사유 확인` : `${outcome.done}건 ${verb}됨`)
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#37352F] bg-white px-4 py-3 shadow-[0_12px_32px_rgba(17,17,16,0.12)] sm:px-5" role="region" aria-label="변경 대기">
      {drafts.length > 0 ? (
        <span className="text-[13.5px] font-semibold text-[#111110]">
          변경 대기 {drafts.length}건 <span className="font-normal tabular-nums text-[#615D59]">· ¥{cny(total)}</span>
        </span>
      ) : null}
      {drafts.length > 0 ? (
        <span className="text-[12px] text-[#615D59]">초안 {checkPlan.count} · 확인됨 {applyPlan.count + applyPlan.skippedLocal}</span>
      ) : null}
      {result ? <span role="status" className="text-[12.5px] text-[#084734]">{result}</span> : null}
      {!serverQueue ? <span className="text-[12px] text-[#7A520F]">서버 연결이 끊겨 반영할 수 없습니다</span> : null}
      <span className="flex-1" />
      {confirming ? (
        <>
          <span className="text-[12.5px] text-[#111110]">{applyPlan.count}건 · ¥{cnyExact(applyPlan.total)}을 장부에 반영합니다</span>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-9 rounded-lg border border-[rgba(0,0,0,0.15)] px-3 text-[13px] font-semibold text-[#37352F]">취소</button>
          <button type="button" disabled={busy} onClick={() => void run("apply")} className="min-h-9 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? "반영 중…" : "반영"}</button>
        </>
      ) : (
        <>
          {checkPlan.count > 0 ? (
            <button type="button" disabled={busy} onClick={() => void run("check")} className="min-h-9 rounded-lg border border-[#084734] px-3 text-[13px] font-semibold text-[#084734] disabled:opacity-50">{checkPlan.count}건 확인</button>
          ) : null}
          {applyPlan.count > 0 && serverQueue ? (
            <button type="button" disabled={busy} onClick={() => { setResult(null); setConfirming(true) }} className="min-h-9 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white disabled:opacity-50">{applyPlan.count}건 장부에 반영</button>
          ) : null}
          <button type="button" onClick={onShowAll} className="min-h-9 px-2 text-[12.5px] text-[#615D59] underline-offset-2 hover:text-[#111110] hover:underline">모두 보기</button>
        </>
      )}
    </div>
  )
}
