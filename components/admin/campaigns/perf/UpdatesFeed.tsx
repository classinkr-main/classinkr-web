"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  CAMPAIGN_UPDATE_KINDS,
  CAMPAIGN_UPDATE_KIND_LABEL,
  type CampaignUpdate,
  type CampaignUpdateKind,
} from "@/lib/types/marketing-campaign"

// 업데이트 피드 카드 — 캠페인 진행상황 로그 목록 + "업데이트 남기기" 접힘 폼.
// 표시 컴포넌트 계약: 데이터 fetch 없음. 저장(POST)은 onSubmit 으로 위임하고
// 성공 시 피드 재조회도 호출부(SummaryTab)가 perf 재조회로 수행한다.

// 상대시각 — Date.now() 는 렌더 본문이 아니라 모듈 헬퍼에 둔다(기존 SummaryTab
// findUpcomingEvent · SyncStatusBar 와 동일 패턴). perf 데이터는 클라이언트 fetch 후에만
// 렌더되므로 SSR 하이드레이션 불일치 경로가 없다.
export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const diff = Date.now() - t
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`
  const d = new Date(t)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

// kind 칩 — 어드민 라벨 단순화 원칙(파스텔 채움 대신 글자색+1px 보더)으로 종류만 구분.
const KIND_CHIP_CLASS: Record<CampaignUpdateKind, string> = {
  note: "border-[#e8e8e4] text-[#1a1a1a]/50",
  change: "border-[#ECD29C] text-[#A8741A]",
  milestone: "border-[#BDEFD8] text-[#084734]",
}

export function UpdateKindChip({ kind }: { kind: string }) {
  const known = (CAMPAIGN_UPDATE_KINDS as string[]).includes(kind)
    ? (kind as CampaignUpdateKind)
    : null
  // 미지의 kind 는 라벨을 지어내지 않고 raw 값 그대로 중립 표기한다.
  const label = known ? CAMPAIGN_UPDATE_KIND_LABEL[known] : kind
  const cls = known ? KIND_CHIP_CLASS[known] : KIND_CHIP_CLASS.note
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-semibold leading-[1.4] ${cls}`}
    >
      {label}
    </span>
  )
}

export interface UpdateSubmitInput {
  campaignId: string
  kind: CampaignUpdateKind
  body: string
}

export function UpdatesFeed({
  updates,
  campaignOptions,
  onSubmit,
}: {
  updates: CampaignUpdate[]
  /** 폼의 캠페인 select 목록 — 스코어보드와 같은 캠페인 축을 쓴다. */
  campaignOptions: Array<{ id: string; name: string }>
  onSubmit: (input: UpdateSubmitInput) => Promise<void>
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [campaignId, setCampaignId] = useState("")
  const [kind, setKind] = useState<CampaignUpdateKind>("note")
  const [body, setBody] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveCampaignId = campaignId || campaignOptions[0]?.id || ""

  async function handleSubmit() {
    const text = body.trim()
    if (!effectiveCampaignId || !text) {
      setError("캠페인과 내용을 입력하세요.")
      return
    }
    setPending(true)
    setError(null)
    try {
      await onSubmit({ campaignId: effectiveCampaignId, kind, body: text })
      // 성공 — 폼을 접고 초기화한다(피드 갱신은 호출부의 perf 재조회가 반영).
      setBody("")
      setKind("note")
      setFormOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "업데이트 저장에 실패했습니다.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="캠페인 업데이트 피드">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">업데이트 피드</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">캠페인 진행상황 수동 기록 — 최신순</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          disabled={campaignOptions.length === 0}
          aria-expanded={formOpen}
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-50"
        >
          업데이트 남기기
          {formOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {campaignOptions.length === 0 && (
        <p className="mt-2 text-[11px] text-[#A39E98]">캠페인이 없어 업데이트를 기록할 수 없습니다.</p>
      )}

      {formOpen && (
        <div className="mt-4 space-y-3 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={effectiveCampaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              aria-label="업데이트할 캠페인"
              className="min-w-[180px] rounded-md border border-[#E5E5E0] bg-white px-2.5 py-1.5 text-[12px] text-[#111110] outline-none focus:border-[#084734]"
            >
              {campaignOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-[3px]" role="group" aria-label="업데이트 종류">
              {CAMPAIGN_UPDATE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    kind === k
                      ? "bg-[#F6F5F4] text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#615D59]"
                  }`}
                >
                  {CAMPAIGN_UPDATE_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="진행상황을 기록하세요 (예: 소재 2종 교체, 예산 20% 증액)"
            aria-label="업데이트 내용"
            className="w-full rounded-md border border-[#E5E5E0] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#111110] outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#084734]"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-[#B43E3E]">{error}</p>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={pending || !body.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-50"
            >
              {pending ? "저장 중…" : "기록 저장"}
            </button>
          </div>
        </div>
      )}

      {updates.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#fafaf8] py-8 text-center text-[12px] text-[#A39E98]">
          아직 기록된 업데이트가 없습니다 — 첫 진행상황을 남겨보세요.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[#f0f0ec]">
          {updates.map((update) => (
            <li key={update.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <UpdateKindChip kind={update.kind} />
                <span className="text-[12px] font-semibold text-[#111110]">
                  {update.campaignName ?? "캠페인 미상"}
                </span>
                <span className="text-[11px] text-[#1a1a1a]/35">
                  {formatRelativeTime(update.createdAt)}
                  {update.createdBy ? ` · ${update.createdBy}` : ""}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#1a1a1a]/70">
                {update.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
