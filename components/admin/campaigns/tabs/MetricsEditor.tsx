"use client"

import { useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { adminFetchJson } from "@/lib/admin-client"
import { formatRange } from "@/components/admin/campaigns/event-format"
import type { PublicEvent } from "@/lib/types/public-events"
import {
  AD_CHANNEL_LABEL,
  type AdChannel,
  type AdSpendEntry,
  type EventMetrics,
  type RelatedLink,
} from "@/lib/types/event-metrics"

// ─── metrics edit drawer ──────────────────────────────────────────────────────
// 행사 탭에서만 열리는 성과 입력 모달 — 행사 탭 청크에 함께 실린다.

export default function MetricsEditor({
  event,
  metrics,
  onClose,
  onSaved,
}: {
  event: PublicEvent
  metrics: EventMetrics
  onClose: () => void
  onSaved: (m: EventMetrics) => void
}) {
  const [form, setForm] = useState({
    targetLeads: metrics.targetLeads,
    targetRevenue: metrics.targetRevenue,
    impressionsCount: metrics.impressionsCount,
    applicationsCount: metrics.applicationsCount,
    qualifiedLeadsCount: metrics.qualifiedLeadsCount,
    attendeesCount: metrics.attendeesCount,
    dealsCount: metrics.dealsCount,
    dealsRevenue: metrics.dealsRevenue,
    closedCustomerCount: metrics.closedCustomerCount,
    dealCustomers: metrics.dealCustomers ?? "",
    notes: metrics.notes ?? "",
    retrospective: metrics.retrospective ?? "",
    shareMemo: metrics.shareMemo ?? "",
  })
  const [adSpend, setAdSpend] = useState<AdSpendEntry[]>(metrics.adSpendEntries ?? [])
  const [relatedLinks, setRelatedLinks] = useState<RelatedLink[]>(metrics.relatedLinks ?? [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const updateNum = (key: keyof typeof form, v: string) => {
    if (v === "") return update(key, null as never)
    const n = Number(v)
    if (Number.isFinite(n)) update(key, n as never)
  }

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      const saved = await adminFetchJson<EventMetrics>(
        `/api/admin/event-metrics/${event.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            dealCustomers: form.dealCustomers.trim() || null,
            notes: form.notes.trim() || null,
            retrospective: form.retrospective.trim() || null,
            shareMemo: form.shareMemo.trim() || null,
            adSpendEntries: adSpend,
            relatedLinks,
          }),
        }
      )
      onSaved(saved)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  function addAdEntry() {
    setAdSpend((arr) => [...arr, { channel: "google", amount: 0, note: "" }])
  }
  function updateAdEntry(idx: number, patch: Partial<AdSpendEntry>) {
    setAdSpend((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeAdEntry(idx: number) {
    setAdSpend((arr) => arr.filter((_, i) => i !== idx))
  }

  function addRelatedLink() {
    setRelatedLinks((arr) => [...arr, { label: "", url: "" }])
  }
  function updateRelatedLink(idx: number, patch: Partial<RelatedLink>) {
    setRelatedLinks((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeRelatedLink(idx: number) {
    setRelatedLinks((arr) => arr.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">
              성과 입력
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">{event.title}</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{formatRange(event.startsAt, event.endsAt)}</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {err}
            </div>
          )}

          {/* 목표 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              목표
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="목표 리드 수" value={form.targetLeads} onChange={(v) => updateNum("targetLeads", v)} />
              <NumInput label="목표 매출 (원)" value={form.targetRevenue} onChange={(v) => updateNum("targetRevenue", v)} />
            </div>
          </section>

          {/* 퍼널 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              퍼널 단계
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumInput label="노출 수" value={form.impressionsCount} onChange={(v) => updateNum("impressionsCount", v)} />
              <NumInput label="신청자 수" value={form.applicationsCount} onChange={(v) => updateNum("applicationsCount", v)} />
              <NumInput label="유효 리드 수" value={form.qualifiedLeadsCount} onChange={(v) => updateNum("qualifiedLeadsCount", v)} />
              <NumInput label="참석자 수" value={form.attendeesCount} onChange={(v) => updateNum("attendeesCount", v)} />
              <NumInput label="딜 수" value={form.dealsCount} onChange={(v) => updateNum("dealsCount", v)} />
              <NumInput label="딜 매출 (원)" value={form.dealsRevenue} onChange={(v) => updateNum("dealsRevenue", v)} />
            </div>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              ※ 리드 수는 리드 DB에서 자동 집계됩니다 (수동 입력 불필요).
            </p>
          </section>

          {/* 딜 성과 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              딜 성과
            </h3>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <NumInput
                label="실제 성사 고객 수"
                value={form.closedCustomerCount}
                onChange={(v) => updateNum("closedCustomerCount", v)}
                min={0}
                step={1}
              />
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">성사 고객 / 기관</label>
                <textarea
                  value={form.dealCustomers}
                  onChange={(e) => update("dealCustomers", e.target.value)}
                  rows={3}
                  placeholder="예: ○○학원, △△캠퍼스 / 담당자 / 후속 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 광고비 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                광고비 (채널별)
              </h3>
              <button
                onClick={addAdEntry}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                채널 추가
              </button>
            </div>
            {adSpend.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                채널을 추가하여 광고비를 입력하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {adSpend.map((entry, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[110px_1fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 sm:grid-cols-[140px_1fr_1fr_auto]"
                  >
                    <select
                      value={entry.channel}
                      onChange={(e) => updateAdEntry(idx, { channel: e.target.value as AdChannel })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    >
                      {(Object.keys(AD_CHANNEL_LABEL) as AdChannel[]).map((c) => (
                        <option key={c} value={c}>
                          {AD_CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="금액 (원)"
                      aria-label="광고비 금액(원)"
                      value={entry.amount === 0 ? "" : entry.amount}
                      onChange={(e) =>
                        updateAdEntry(idx, { amount: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="text"
                      placeholder="메모 (선택)"
                      aria-label="광고비 메모"
                      value={entry.note ?? ""}
                      onChange={(e) => updateAdEntry(idx, { note: e.target.value })}
                      className="hidden rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px] sm:block"
                    />
                    <button
                      onClick={() => removeAdEntry(idx)}
                      aria-label="채널 삭제"
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 관련 자료 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                관련 자료
              </h3>
              <button
                onClick={addRelatedLink}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                링크 추가
              </button>
            </div>
            {relatedLinks.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                블로그·보도자료 등 관련 글 URL을 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {relatedLinks.map((link, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5"
                  >
                    <input
                      type="text"
                      placeholder="라벨 (예: 블로그 후기)"
                      aria-label="관련 자료 라벨"
                      value={link.label}
                      onChange={(e) => updateRelatedLink(idx, { label: e.target.value })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      aria-label="관련 자료 URL"
                      value={link.url}
                      onChange={(e) => updateRelatedLink(idx, { url: e.target.value })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <button
                      onClick={() => removeRelatedLink(idx)}
                      aria-label="관련 자료 삭제"
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 메모 / 회고 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              메모 / 회고
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">내부 메모 / 다음 액션</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  placeholder="운영 중 이슈, 후속 연락, 다음 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">회고</label>
                <textarea
                  value={form.retrospective}
                  onChange={(e) => update("retrospective", e.target.value)}
                  rows={3}
                  placeholder="잘된 점, 아쉬운 점, 다음 행사에 반영할 점"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">공유 포인트</label>
                <textarea
                  value={form.shareMemo}
                  onChange={(e) => update("shareMemo", e.target.value)}
                  rows={3}
                  placeholder="팀에 공유할 핵심 포인트. 예: 부산권 원장님들은 하이브리드 수업보다 신규반 모집 사례에 반응"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#111110] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#084734] disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}

function NumInput({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string
  value: number | null
  onChange: (v: string) => void
  min?: number
  step?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">{label}</label>
      <input
        type="number"
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        step={step}
        className="w-full rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
      />
    </div>
  )
}
