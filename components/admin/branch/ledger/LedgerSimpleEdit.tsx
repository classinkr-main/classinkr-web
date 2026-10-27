"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { planBulkApply, planBulkCheck } from "./draft-bulk-plan"
import { productLabel } from "./ledger-simple-logic"
import type { DraftConfidence, LedgerDraft, LedgerRevenueRow } from "./shared"

// 장부(A안) 입력·수정 — 칸 안에서 바로(금액 + 확도 글자 띠 예·고·확) + 시안 3(확인·반영을 하단 한 줄로).
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


const formatInput = (value: number) => (value > 0 ? value.toLocaleString("en-US") : "")

/** 칸 안에서 바로 고치는 입력 — 팝업 없이 금액 칸이 입력칸이 되고, 아래에 확도 세 칸짜리 작은 띠가 붙는다. */
export function InlineCellEditor({ label, month, candidates, edit, onClose, onMore }: {
  /** 스크린리더용 칸 이름(고객 · 월). */
  label: string
  month: string
  /** 이 칸에서 고칠 수 있는 딜 — 여럿이면 칸 위 작은 선택 상자로 고른다. */
  candidates: LedgerRevenueRow[]
  edit: LedgerCellEditApi
  /** returnFocus=false: 포커스가 이미 다른 곳으로 간 경우(칸 밖 클릭) — 칸으로 되돌리지 않는다. */
  onClose: (returnFocus?: boolean) => void
  onMore: (row: LedgerRevenueRow) => void
}) {
  const [row, setRow] = useState<LedgerRevenueRow>(candidates[0])
  const initialValue = edit.value(row, month)
  const initialConfidence = edit.confidence(row, month)
  const [amount, setAmount] = useState(() => formatInput(initialValue))
  const [confidence, setConfidence] = useState<DraftConfidence>(initialConfidence)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [row])

  const pick = (id: string) => {
    const next = candidates.find((candidate) => candidate.id === id)
    if (!next) return
    setRow(next)
    setAmount(formatInput(edit.value(next, month)))
    setConfidence(edit.confidence(next, month))
  }

  const save = async () => {
    if (saving) return
    const parsed = parseAmountInput(amount)
    if (parsed === null) return
    if (parsed === initialValue && confidence === initialConfidence) {
      onClose()
      return
    }
    setSaving(true)
    const ok = await edit.commit(row.id, month, parsed, confidence)
    setSaving(false)
    if (ok) onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      void save()
      return
    }
    // 확도 키는 금액 입력칸에서만 — 딜 선택 상자의 글자 찾기를 막지 않는다.
    if (!(event.target instanceof HTMLInputElement) || event.metaKey || event.ctrlKey || event.altKey) return
    const next = confidenceFromKey(event.key)
    if (next) {
      event.preventDefault()
      setConfidence(next)
    }
  }

  return (
    <div
      role="group"
      aria-label={`${label} 수정`}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // 칸 밖으로 포커스가 나가면 저장하지 않고 닫는다(Enter·↵ 만 저장).
        if (!saving && !event.currentTarget.contains(event.relatedTarget as Node | null)) onClose(false)
      }}
      className="flex min-w-[124px] flex-col gap-1"
    >
      {candidates.length > 1 ? (
        <select
          aria-label="고칠 딜"
          value={row.id}
          onChange={(event) => pick(event.target.value)}
          className="h-7 min-w-0 rounded-md border border-[rgba(0,0,0,0.15)] bg-white px-1 text-[11.5px] text-[#37352F] outline-none focus:border-[#084734]"
        >
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {productLabel(candidate)}{candidate.productVersion ? ` · ${candidate.productVersion}` : ""} — ¥{cny(edit.value(candidate, month))}
            </option>
          ))}
        </select>
      ) : null}
      <label className="flex h-8 items-center gap-1.5 rounded-md border border-[#084734] bg-white px-1.5 shadow-[0_0_0_3px_rgba(8,71,52,0.12)]">
        <span aria-hidden className="text-[11.5px] text-[#8A857D]">¥</span>
        <input
          ref={inputRef}
          inputMode="numeric"
          aria-label={`${label} 금액${initialValue > 0 ? ` (지금 ¥${cnyExact(initialValue)})` : ""}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0"
          disabled={saving}
          className="w-full min-w-0 bg-transparent text-right text-[13px] font-semibold tabular-nums text-[#111110] outline-none"
        />
      </label>
      <div className="flex items-center justify-end gap-0.5">
        <div role="group" aria-label="확도" className="flex items-center gap-0.5">
          {CONFIDENCE_KEYS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={confidence === item.id}
              aria-label={`${item.label} (${item.key})`}
              title={`${item.label} · ${item.key}`}
              // 누를 때 입력칸 포커스를 뺏지 않는다 — 이어서 숫자·Enter 를 칠 수 있게.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setConfidence(item.id)}
              className={`grid h-6 min-w-6 place-items-center rounded px-1 text-[11.5px] font-bold transition ${CONFIDENCE_TOKENS[item.id].textStrongClass} ${confidence === item.id ? "ring-1 ring-current" : "opacity-60 hover:opacity-100"}`}
              style={confidence === item.id ? { backgroundColor: CONFIDENCE_TOKENS[item.id].tintBg } : undefined}
            >
              {item.label.slice(0, 1)}
            </button>
          ))}
        </div>
        <span aria-hidden className="mx-0.5 h-3.5 w-px bg-[rgba(0,0,0,0.12)]" />
        <button
          type="button"
          aria-label="주차·메모 더 보기"
          title="주차·메모"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onMore(row)}
          className="h-6 rounded px-1 text-[12px] leading-none text-[#615D59] hover:bg-[#F1EFEA] hover:text-[#111110]"
        >
          ⋯
        </button>
        <button
          type="button"
          aria-label="저장"
          title="저장 · Enter"
          disabled={saving || parseAmountInput(amount) === null}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void save()}
          className="h-6 rounded bg-[#084734] px-1.5 text-[11px] font-semibold text-white transition hover:bg-[#065c41] disabled:opacity-50"
        >
          {saving ? "…" : "↵"}
        </button>
      </div>
    </div>
  )
}

/** 시안 3 — 대기 중인 변경을 화면 아래 한 줄(어두운 바)로. 확인·반영은 체크 큐와 같은 일괄 함수, 반영은 한 번 더 묻는다. */
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
    <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-[#1F1D1A] px-4 py-2.5 text-white shadow-[0_12px_32px_rgba(17,17,16,0.18)] sm:pl-5" role="region" aria-label="변경 대기">
      {drafts.length > 0 ? (
        <ol aria-label="결재 단계" className="flex items-center gap-2 text-[13.5px]">
          <li className="font-bold">초안 {checkPlan.count}</li>
          <li aria-hidden className="text-[#A39E98]">→</li>
          <li className="font-bold">확인됨 {applyPlan.count + applyPlan.skippedLocal}</li>
          <li aria-hidden className="text-[#A39E98]">→</li>
          <li className="text-[#D9D4CB]">반영</li>
        </ol>
      ) : null}
      {drafts.length > 0 ? (
        <span className="text-[12.5px] tabular-nums text-[#D9D4CB]">
          변경 대기 {drafts.length}건 · <span className="font-semibold text-white">¥{cny(total)}</span>
        </span>
      ) : null}
      {result ? <span role="status" className="text-[12.5px] text-[#BDEFD8]">{result}</span> : null}
      {!serverQueue ? <span className="text-[12px] text-[#F3D9A4]">서버 연결이 끊겨 반영할 수 없습니다</span> : null}
      <span className="flex-1" />
      {confirming ? (
        <>
          <span className="text-[12.5px]">{applyPlan.count}건 · ¥{cnyExact(applyPlan.total)}을 장부에 반영합니다</span>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-10 rounded-lg border border-[rgba(255,255,255,0.4)] px-3 text-[13px] font-semibold text-white">취소</button>
          <button type="button" disabled={busy} onClick={() => void run("apply")} className="min-h-10 rounded-lg bg-white px-4 text-[13px] font-semibold text-[#084734] disabled:opacity-50">{busy ? "반영 중…" : "반영"}</button>
        </>
      ) : (
        <>
          <button type="button" onClick={onShowAll} className="min-h-10 px-2 text-[12.5px] text-[#D9D4CB] underline-offset-2 hover:text-white hover:underline">모두 보기</button>
          {checkPlan.count > 0 ? (
            <button type="button" disabled={busy} onClick={() => void run("check")} className="min-h-10 rounded-lg border border-white px-3 text-[13px] font-semibold text-white disabled:opacity-50">{checkPlan.count}건 확인</button>
          ) : null}
          {applyPlan.count > 0 && serverQueue ? (
            <button type="button" disabled={busy} onClick={() => { setResult(null); setConfirming(true) }} className="min-h-10 rounded-lg bg-white px-4 text-[13px] font-semibold text-[#084734] disabled:opacity-50">{applyPlan.count}건 장부에 반영</button>
          ) : null}
        </>
      )}
    </div>
  )
}
