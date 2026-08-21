"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  CAMPAIGN_UPDATE_KINDS,
  CAMPAIGN_UPDATE_KIND_LABEL,
  type CampaignUpdate,
  type CampaignUpdateKind,
} from "@/lib/types/marketing-campaign"
import { COUNT } from "@/components/admin/campaigns/event-format"
import { formatRelativeTime, UpdateKindChip } from "./format"

// 업데이트 피드 카드 — 캠페인 진행상황 로그 목록 + "업데이트 남기기" 접힘 폼.
// 표시 컴포넌트 계약: 데이터 fetch 없음. 저장(POST)은 onSubmit 으로 위임하고
// 성공 시 피드 재조회도 호출부(SummaryTab)가 perf 재조회로 수행한다.
// formatRelativeTime·UpdateKindChip 은 ./format 공유 모듈로 옮겼다(CampaignScoreboard 와
// 공용 — 스코어보드가 이 피드 컴포넌트 모듈을 거꾸로 끌어오지 않게 분리했다).

export interface UpdateSubmitInput {
  campaignId: string
  kind: CampaignUpdateKind
  body: string
}

const BODY_MAX = 2000
// 남은 여유가 10% 밑으로 떨어지면 카운터를 caution 톤으로 — 2000자에서 잘려나가는 걸
// 저장 후에야 아는 상황을 막는다.
const BODY_CAUTION = Math.floor(BODY_MAX * 0.9)
const SAVED_MS = 1500

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
  const [savedFlash, setSavedFlash] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const effectiveCampaignId = campaignId || campaignOptions[0]?.id || ""

  async function handleSubmit() {
    const text = body.trim()
    if (!effectiveCampaignId || !text) {
      setError("캠페인과 내용을 입력하세요.")
      return
    }
    setPending(true)
    setError(null)
    setSavedFlash(false)
    try {
      await onSubmit({ campaignId: effectiveCampaignId, kind, body: text })
      // 성공 — 폼은 열어둔 채 본문만 비운다. 캠페인·종류 선택을 유지해야 같은 캠페인에
      // 연속으로 기록할 수 있다(폼을 통째로 닫으면 매번 다시 열고 다시 고르게 된다).
      setBody("")
      setSavedFlash(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), SAVED_MS)
      bodyRef.current?.focus()
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
          <div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter 제출 — textarea 관례. 한글 조합 중에는 Enter 가 조합 확정이라
                // 그대로 흘려보낸다(조합 확정이 곧 제출이 되면 문장이 잘린 채 저장된다).
                if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return
                if (e.nativeEvent.isComposing) return
                e.preventDefault()
                if (pending || !body.trim()) return
                void handleSubmit()
              }}
              rows={3}
              maxLength={BODY_MAX}
              // 저장 중 잠그지 않으면 이어 쓴 문장이 성공 후 초기화에 그대로 지워진다.
              disabled={pending}
              placeholder="진행상황을 기록하세요 (예: 소재 2종 교체, 예산 20% 증액)"
              aria-label="업데이트 내용"
              className="w-full rounded-md border border-[#E5E5E0] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#111110] outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#084734] disabled:opacity-60"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#A39E98]">
                <kbd className="font-sans">⌘/Ctrl</kbd> + <kbd className="font-sans">Enter</kbd> 로 저장
              </span>
              <span
                className={`text-[11px] tabular-nums ${
                  body.length >= BODY_CAUTION ? "text-[#A8741A]" : "text-[#A39E98]"
                }`}
              >
                {COUNT.format(body.length)} / {COUNT.format(BODY_MAX)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p role="alert" className="text-[11px] text-[#B43E3E]">{error}</p>
            <div className="flex items-center gap-2">
              {/* 항상 렌더된 라이브 리전 — 성공 문구를 나중에 삽입하면 읽히지 않는 리더가 있다. */}
              <span role="status" aria-live="polite" className="text-[11px] text-[#084734]">
                {savedFlash ? "기록했습니다" : ""}
              </span>
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
