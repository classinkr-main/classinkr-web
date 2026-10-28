"use client"

// 품목 설정(입고관리 권한자 전용) — 최소재고·리드타임·물류번호 관리·보고 묶음·정렬.
// PATCH /api/admin/hardware/items/[id] 로 바뀐 칸만 보낸다(stock-admin-model validateItemSettings).

import { useEffect, useId, useMemo, useState } from "react"
import { Settings2, X } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { HARDWARE_REPORT_GROUP_LABELS, HARDWARE_REPORT_GROUPS, type HardwareReportGroup } from "@/lib/hardware/inventory-process"
import type { HardwareItem } from "./shared"
import { itemSettingsDraftFrom, saveItemSettings, validateItemSettings, type ItemSettingsDraft } from "./stock-admin-model"

interface Props {
  item: HardwareItem
  onClose: () => void
  onSaved: (message: string) => void
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none transition placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:opacity-60"

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11.5px] font-semibold text-[#B43E3E]">{message}</p> : null
}

export default function ItemSettingsSheet({ item, onClose, onSaved }: Props) {
  const titleId = useId()
  const [draft, setDraft] = useState<ItemSettingsDraft>(() => itemSettingsDraftFrom(item))
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validation = useMemo(() => validateItemSettings(draft, item), [draft, item])
  const changed = Object.keys(validation.patch).length > 0
  const errors = attempted ? validation.errors : {}

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || saving) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose, saving])

  const update = (patch: Partial<ItemSettingsDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError(null)
  }

  const save = async () => {
    if (saving) return
    setAttempted(true)
    setError(null)
    if (Object.keys(validation.errors).length > 0) return
    if (!changed) {
      setError("바뀐 값이 없습니다.")
      return
    }
    setSaving(true)
    try {
      await saveItemSettings(adminFetchJson, item.id, validation.patch)
      onSaved(`${item.name} 품목 설정을 저장했습니다.`)
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "품목 설정을 저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

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
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
              <Settings2 className="h-4 w-4 text-[#615D59]" aria-hidden />
              품목 설정 · <span className="truncate">{item.name}</span>
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">가용 재고가 최소재고보다 적으면 부족 알림이 뜹니다(같으면 뜨지 않습니다).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="품목 설정 닫기"
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
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-bold text-[#615D59]">최소재고 (대)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.reorderPoint}
                  onChange={(event) => update({ reorderPoint: event.target.value })}
                  aria-invalid={errors.reorderPoint ? true : undefined}
                  autoComplete="off"
                  className={`mt-1 ${INPUT_CLASS} text-right tabular-nums`}
                />
                <FieldError message={errors.reorderPoint} />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-[#615D59]">리드타임 (일)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.leadTimeDays}
                  onChange={(event) => update({ leadTimeDays: event.target.value })}
                  aria-invalid={errors.leadTimeDays ? true : undefined}
                  autoComplete="off"
                  className={`mt-1 ${INPUT_CLASS} text-right tabular-nums`}
                />
                <FieldError message={errors.leadTimeDays} />
              </label>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={draft.lotTracked}
                onChange={(event) => update({ lotTracked: event.target.checked })}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-[#084734]"
              />
              <span>
                <span className="block text-[13px] font-semibold text-[#111110]">물류번호 관리</span>
                <span className="block text-[11.5px] text-[#615D59]">끄면 입고·출고에서 물류번호를 묻지 않고 수량만 기록합니다(액세서리·터치펜).</span>
              </span>
            </label>

            <label className="block">
              <span className="text-[11px] font-bold text-[#615D59]">보고 묶음 (판매대시보드 행)</span>
              <select
                value={draft.reportGroup}
                onChange={(event) => update({ reportGroup: event.target.value as HardwareReportGroup | "" })}
                aria-invalid={errors.reportGroup ? true : undefined}
                className={`mt-1 ${INPUT_CLASS}`}
              >
                <option value="">미지정</option>
                {HARDWARE_REPORT_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {HARDWARE_REPORT_GROUP_LABELS[group]}
                  </option>
                ))}
              </select>
              <FieldError message={errors.reportGroup} />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold text-[#615D59]">정렬 (작을수록 앞)</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.sortOrder}
                onChange={(event) => update({ sortOrder: event.target.value })}
                aria-invalid={errors.sortOrder ? true : undefined}
                placeholder="비우면 이름순"
                autoComplete="off"
                className={`mt-1 ${INPUT_CLASS} max-w-[140px] text-right tabular-nums`}
              />
              <FieldError message={errors.sortOrder} />
            </label>
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
                {saving ? "저장 중…" : "설정 저장"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
