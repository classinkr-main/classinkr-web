"use client"

import { useCallback, useId, useRef, useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { adminFetchJson } from "@/lib/admin-client"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { blurOnWheel } from "@/components/admin/number-input-guards"
import { clampCount, clampMoney } from "@/lib/marketing/input-normalize"
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

// 작성 중 닫기 확인 문구 — AdLeadImportDialog(붙여넣기 다이얼로그)와 같은 결.
const CLOSE_CONFIRM = "입력한 내용이 있습니다. 닫으면 사라집니다. 닫을까요?"

// 렌더 전용 행 id. key={idx} 는 중간 행을 지우면 인덱스가 밀려 포커스가 엉뚱한 행을 가리킨다.
// 저장 payload(EventMetrics)에는 절대 나가지 않는다 — 저장 직전 필요한 필드만 골라 보낸다.
let rowSeq = 0
const nextRowId = () => `row-${(rowSeq += 1)}`
type AdSpendRow = AdSpendEntry & { rowId: string }
type RelatedLinkRow = RelatedLink & { rowId: string }
function withRowIds<T extends object>(items: T[]): (T & { rowId: string })[] {
  return items.map((item) => ({ ...item, rowId: nextRowId() }))
}

// 서버 스냅샷 → 폼 상태. 최초 마운트와 "서버 값 불러오기"가 같은 변환을 쓴다.
function formSnapshot(m: EventMetrics) {
  return {
    targetLeads: m.targetLeads,
    targetRevenue: m.targetRevenue,
    impressionsCount: m.impressionsCount,
    applicationsCount: m.applicationsCount,
    qualifiedLeadsCount: m.qualifiedLeadsCount,
    attendeesCount: m.attendeesCount,
    dealsCount: m.dealsCount,
    dealsRevenue: m.dealsRevenue,
    closedCustomerCount: m.closedCustomerCount,
    dealCustomers: m.dealCustomers ?? "",
    notes: m.notes ?? "",
    retrospective: m.retrospective ?? "",
    shareMemo: m.shareMemo ?? "",
  }
}

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
  const [form, setForm] = useState(() => formSnapshot(metrics))
  const [adSpend, setAdSpend] = useState<AdSpendRow[]>(() => withRowIds(metrics.adSpendEntries ?? []))
  const [relatedLinks, setRelatedLinks] = useState<RelatedLinkRow[]>(() =>
    withRowIds(metrics.relatedLinks ?? [])
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // 사용자가 한 글자라도 고쳤는지. true 면 서버 값이 폼을 자동으로 덮지 못한다.
  const [dirty, setDirty] = useState(false)
  // 편집 중인데 서버 쪽이 갱신된 상태 — 덮어쓰는 대신 배너로 알린다.
  const [stale, setStale] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const fieldId = useId()

  // 작성 중 닫기(Escape·X·취소)는 확인을 거친다 — 저장 경로(handleSave)는 확인 없이 그대로 닫는다.
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(CLOSE_CONFIRM)) return
    onClose()
  }, [dirty, onClose])
  useDialogFocus(event.id, requestClose, closeButtonRef)

  // 같은 화면의 퀵 테이블이 저장한 값(metrics.updatedAt 갱신)이 도착하면 폼을 다시 맞춘다 —
  // 마운트 시점 스냅샷을 계속 들고 있으면 편집기 저장(전체본 PATCH)이 방금 저장을 옛 값으로 덮는다.
  // 단 편집을 시작한 뒤(dirty)에는 절대 덮지 않는다 — 작성 중이던 한글 장문(성사 고객·메모·회고·
  // 공유 포인트)과 광고비/링크 배열이 통째로 사라지던 유실 경로였다. 이때는 stale 배너로만 알린다.
  // (렌더 중 state 조정 패턴 — prop 변경 감지, useEffect 캐스케이드 없음)
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState(metrics.updatedAt)
  if (metrics.updatedAt !== syncedUpdatedAt) {
    setSyncedUpdatedAt(metrics.updatedAt)
    if (dirty) {
      setStale(true)
    } else {
      setForm(formSnapshot(metrics))
      setAdSpend(withRowIds(metrics.adSpendEntries ?? []))
      setRelatedLinks(withRowIds(metrics.relatedLinks ?? []))
    }
  }

  // 배너의 "서버 값 불러오기" — 사용자가 명시적으로 눌렀을 때만 폼을 서버 값으로 교체한다.
  function loadServerValues() {
    setForm(formSnapshot(metrics))
    setAdSpend(withRowIds(metrics.adSpendEntries ?? []))
    setRelatedLinks(withRowIds(metrics.relatedLinks ?? []))
    setDirty(false)
    setStale(false)
  }

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setDirty(true)
    setForm((f) => ({ ...f, [key]: value }))
  }

  // 숫자 필드는 저장소 정본 규칙(lib/marketing/input-normalize — floor + >=0 클램프)을 따른다.
  // 목표/딜 매출도 원 단위 정수라 건수와 같은 규칙이다. 빈 문자열만 null(미입력)로 남겨 0 과 구분하고,
  // 비수치 입력은 기존처럼 무시한다(직전 값 보존).
  const updateNum = (key: keyof typeof form, v: string) => {
    if (v.trim() === "") return update(key, null as never)
    const n = clampCount(v)
    if (n != null) update(key, n as never)
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
            // rowId 는 렌더 전용이라 저장 payload 에서 뺀다 — EventMetrics 형태를 그대로 유지.
            adSpendEntries: adSpend.map((e) => ({ channel: e.channel, amount: e.amount, note: e.note })),
            relatedLinks: relatedLinks.map((l) => ({ label: l.label, url: l.url })),
          }),
        }
      )
      // 저장 성공 시점부터는 방금 보낸 값이 정본 — dirty 를 풀어 다음 서버 값이 정상 반영되게 한다.
      setDirty(false)
      setStale(false)
      onSaved(saved)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  function addAdEntry() {
    setDirty(true)
    setAdSpend((arr) => [...arr, { channel: "google", amount: 0, note: "", rowId: nextRowId() }])
  }
  function updateAdEntry(idx: number, patch: Partial<AdSpendEntry>) {
    setDirty(true)
    setAdSpend((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeAdEntry(idx: number) {
    setDirty(true)
    setAdSpend((arr) => arr.filter((_, i) => i !== idx))
  }

  function addRelatedLink() {
    setDirty(true)
    setRelatedLinks((arr) => [...arr, { label: "", url: "", rowId: nextRowId() }])
  }
  function updateRelatedLink(idx: number, patch: Partial<RelatedLink>) {
    setDirty(true)
    setRelatedLinks((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeRelatedLink(idx: number) {
    setDirty(true)
    setRelatedLinks((arr) => arr.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${event.title} 성과 입력`}
        className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">
              성과 입력
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">{event.title}</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{formatRange(event.startsAt, event.endsAt)}</p>
          </div>
          <button ref={closeButtonRef} onClick={requestClose} aria-label="닫기" className="text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {err && (
            <div className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] text-[#B43E3E]">
              {err}
            </div>
          )}

          {/* 편집 중 서버 값이 바뀐 경우 — 덮어쓰지 않고 선택지를 준다(자동 덮어쓰기 = 입력 유실). */}
          {stale && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d8d6cf] bg-white px-3 py-2 text-[12px] text-[#1a1a1a]/70"
            >
              <span>다른 곳에서 이 행사 지표가 저장됐습니다. 저장하면 지금 입력한 값으로 덮어씁니다.</span>
              <button
                type="button"
                onClick={loadServerValues}
                className="shrink-0 rounded-md border border-[#d8d6cf] bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110] transition-colors hover:bg-[#f6f5f2]"
              >
                서버 값 불러오기
              </button>
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
                <label
                  htmlFor={`${fieldId}-deal-customers`}
                  className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50"
                >
                  성사 고객 / 기관
                </label>
                <textarea
                  id={`${fieldId}-deal-customers`}
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
              <p className="py-3 text-center text-[12px] text-[#A39E98]">
                채널을 추가하여 광고비를 입력하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {adSpend.map((entry, idx) => (
                  <div
                    key={entry.rowId}
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
                      // 금액도 정본 규칙(floor + >=0)으로 클램프. amount 는 non-null 필드라 빈값은 0.
                      onChange={(e) => updateAdEntry(idx, { amount: clampMoney(e.target.value) ?? 0 })}
                      onWheel={blurOnWheel}
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
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-[#FCE9E9] hover:text-[#B43E3E]"
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
              <p className="py-3 text-center text-[12px] text-[#A39E98]">
                블로그·보도자료 등 관련 글 URL을 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {relatedLinks.map((link, idx) => (
                  <div
                    key={link.rowId}
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
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-[#FCE9E9] hover:text-[#B43E3E]"
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
                <label htmlFor={`${fieldId}-notes`} className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">
                  내부 메모 / 다음 액션
                </label>
                <textarea
                  id={`${fieldId}-notes`}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  placeholder="운영 중 이슈, 후속 연락, 다음 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-retrospective`}
                  className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50"
                >
                  회고
                </label>
                <textarea
                  id={`${fieldId}-retrospective`}
                  value={form.retrospective}
                  onChange={(e) => update("retrospective", e.target.value)}
                  rows={3}
                  placeholder="잘된 점, 아쉬운 점, 다음 행사에 반영할 점"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-share-memo`}
                  className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50"
                >
                  공유 포인트
                </label>
                <textarea
                  id={`${fieldId}-share-memo`}
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
          <button onClick={requestClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-[#084734] px-5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#065c41] disabled:opacity-40"
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
  // 라벨-인풋을 htmlFor/id 로 묶는다 — 형제 div 로만 두면 스크린리더에 이름 없는 필드로 노출된다.
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        onWheel={blurOnWheel}
        min={min}
        step={step}
        className="w-full rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
      />
    </div>
  )
}
