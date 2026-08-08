"use client"

/**
 * SendCenter — 캠페인 "발송 작성" 서브탭 전체 (시안 2a 단체 발송 센터 레이아웃)
 *
 * 좌측 스택(받는 사람 → 채널 상태 → 메시지 → 알림톡 테스트 패널) + 우측 레일
 * (발송 내역서 · 최종 확인 · CTA · 저장 세그먼트). lg 미만은 스택.
 *
 * 상태 소유권:
 * - 초안(제목/본문/태그)·저장 세그먼트·발송 로직은 MarketingHub가 계속 소유한다
 *   (초안 유지/세그먼트 localStorage/handleSendEmail 회귀 금지).
 * - 대상 모드(태그/직접)·직접 입력·알림톡 패널 열림은 이 컴포넌트 로컬 —
 *   기존 EmailComposer에서도 탭 이동 시 사라지던 값들이라 동작 동일.
 * - 수신자 프리필(고객 360 딥링크)은 알림톡 테스트 패널을 자동으로 열고
 *   KakaoComposer의 테스트 번호 초기값으로만 쓰인다(기존 흐름 승계).
 */

import { useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EmailDraft, SavedEmailSegment, Subscriber } from "@/lib/marketing-types"
import type { MessagingStatus } from "@/lib/messaging-client-types"
import type { MessagePrefill } from "@/lib/message-prefill"
import ReachCoverageCard from "./ReachCoverageCard"
import ChannelCascadeCard from "./ChannelCascadeCard"
import MessageComposeCard from "./MessageComposeCard"
import SendInvoiceRail from "./SendInvoiceRail"
import type { PreSendCheck, SendReadiness, VariableBlockDef } from "./send-center-types"

// 알림톡 테스트 발송 패널은 열릴 때만 렌더되므로 청크도 그때만 로드한다.
// 프리필 자동 오픈 경로는 그대로 — 패널 섹션(헤더 포함)은 즉시 열리고,
// 컴포저 본체만 청크 도착까지 골격으로 대체된다(recipientPrefill은 허브 상태라 유실 없음).
const KakaoComposer = dynamic(() => import("./KakaoComposer"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" aria-hidden />,
})

type AudienceMode = "tags" | "direct"

interface SendCenterProps {
  draft: EmailDraft
  onDraftChange: (draft: EmailDraft) => void
  subscribers: Subscriber[]
  activeCount: number
  unsubscribedCount: number
  tagCountMap: Record<string, number>
  checks: PreSendCheck[]
  readiness: SendReadiness
  /** 태그 모드 기준 발송 대상 수 (허브 composerReview.selectedAudience) */
  selectedAudience: number
  messagingStatus: MessagingStatus | null
  messagingStatusLoaded: boolean
  recipientPrefill: MessagePrefill | null
  onClearRecipientPrefill: () => void
  draftNotice: string | null
  activeSegment: SavedEmailSegment | null
  hasDraft: boolean
  onClearDraft: () => void
  savedSegmentViews: Array<SavedEmailSegment & { recipientCount: number }>
  segmentName: string
  onSegmentNameChange: (name: string) => void
  onSaveSegment: () => void
  onApplySegment: (segment: SavedEmailSegment) => void
  onDeleteSegment: (segment: SavedEmailSegment) => void
  onSend: (data: EmailDraft & { directEmails?: string[] }) => Promise<void>
  sendLoading: boolean
}

export default function SendCenter({
  draft,
  onDraftChange,
  subscribers,
  activeCount,
  unsubscribedCount,
  tagCountMap,
  checks,
  readiness,
  selectedAudience,
  messagingStatus,
  messagingStatusLoaded,
  recipientPrefill,
  onClearRecipientPrefill,
  draftNotice,
  activeSegment,
  hasDraft,
  onClearDraft,
  savedSegmentViews,
  segmentName,
  onSegmentNameChange,
  onSaveSegment,
  onApplySegment,
  onDeleteSegment,
  onSend,
  sendLoading,
}: SendCenterProps) {
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("tags")
  const [directInput, setDirectInput] = useState("")
  // 알림톡 테스트 패널 — 사용자가 직접 여닫기 전(null)에는 프리필 존재 여부로 파생한다.
  // effect 없이도 늦게 도착한 프리필(딥링크 마운트 순서)이 패널을 자동으로 연다.
  const [kakaoTestManual, setKakaoTestManual] = useState<boolean | null>(null)
  const kakaoTestOpen = kakaoTestManual ?? !!recipientPrefill
  const kakaoPanelRef = useRef<HTMLDivElement>(null)

  const openKakaoTest = () => {
    setKakaoTestManual(true)
    requestAnimationFrame(() => {
      kakaoPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  // 태그 기준 현재 대상 — EmailComposer.tagRecipientPreview와 동일 기준
  const recipients = useMemo(() => {
    if (draft.targetTags.length === 0) return subscribers.filter((s) => s.status === "active")
    return subscribers.filter(
      (s) => s.status === "active" && s.tags.some((t) => draft.targetTags.includes(t))
    )
  }, [subscribers, draft.targetTags])

  // 직접 입력 파싱 — EmailComposer.parsedDirectEmails와 동일 규칙
  const directEmails = useMemo(() => {
    if (!directInput.trim()) return []
    return directInput
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  }, [directInput])

  const audienceCount = audienceMode === "direct" ? directEmails.length : selectedAudience

  const emailReach =
    audienceMode === "direct"
      ? directEmails.length
      : recipients.filter((s) => (s.email ?? "").trim().length > 0).length
  const phoneReach =
    audienceMode === "direct" ? 0 : recipients.filter((s) => (s.phone ?? "").trim().length > 0).length

  // 변수 블록 정의 — 발송 백엔드가 실제 치환하는 {name}/{org}/{role}만.
  // 예시값은 현재 대상의 실값(첫 비어있지 않은 값), 빈 값 수는 대상 전체 기준.
  const variables = useMemo<VariableBlockDef[]>(() => {
    const firstNonEmpty = (pick: (s: Subscriber) => string | undefined, fallback: string) => {
      for (const s of recipients) {
        const v = (pick(s) ?? "").trim()
        if (v) return v
      }
      return fallback
    }
    const emptyCount = (pick: (s: Subscriber) => string | undefined) =>
      recipients.filter((s) => !(pick(s) ?? "").trim()).length

    return [
      {
        token: "{name}",
        label: "이름",
        source: "subscribers.name",
        example: firstNonEmpty((s) => s.name, "김원장"),
      },
      {
        token: "{org}",
        label: "학원명",
        source: "subscribers.org",
        example: firstNonEmpty((s) => s.org, "클래스인 아카데미"),
        emptyCount: recipients.length > 0 ? emptyCount((s) => s.org) : undefined,
      },
      {
        token: "{role}",
        label: "직책",
        source: "subscribers.role",
        example: firstNonEmpty((s) => s.role, "원장"),
        emptyCount: recipients.length > 0 ? emptyCount((s) => s.role) : undefined,
      },
    ]
  }, [recipients])

  return (
    <div className="space-y-4">
      {/* ── 컨텍스트 배너 ─────────────────────────── */}
      {recipientPrefill && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[#084734]/20 bg-[#ECFDF5] px-4 py-3">
          <p className="min-w-0 text-[12px] leading-relaxed text-[#084734]">
            <span className="font-semibold">수신자</span>
            {" — "}
            {recipientPrefill.name ? `${recipientPrefill.name} · ` : ""}
            <span className="font-mono">{recipientPrefill.rawPhone}</span>
            <span className="ml-1 text-[#084734]/70">
              (고객 360에서 연결 · 알림톡 테스트 발송 번호에 미리 입력됩니다)
            </span>
          </p>
          <button
            type="button"
            onClick={onClearRecipientPrefill}
            aria-label="수신자 프리필 지우기"
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#084734]/60 transition-colors hover:bg-[#D1FAE5] hover:text-[#084734]"
          >
            지우기
          </button>
        </div>
      )}

      {(activeSegment || hasDraft) && (
        <div className="flex flex-col gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-[#1a1a1a]/55">
            {draftNotice
              ? draftNotice
              : activeSegment
                ? `"${activeSegment.name}" 세그먼트 기준`
                : "초안이 유지됩니다 — 탭 이동 후 돌아와도 내용이 남아있습니다."}
          </p>
          <Button variant="outline" size="sm" onClick={onClearDraft} className="shrink-0 text-[12px]">
            초안 비우기
          </Button>
        </div>
      )}

      {activeCount === 0 && audienceMode === "tags" && (
        <div className="rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3 text-[13px] text-[#7A520F]">
          활성 구독자가 없습니다. 발송 대상이 비어 있을 수 있으니 먼저 구독자를 확인하세요.
        </div>
      )}

      {/* ── 본 레이아웃: 좌측 스택 + 우측 레일 ────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <ReachCoverageCard
            audienceMode={audienceMode}
            onAudienceModeChange={setAudienceMode}
            targetTags={draft.targetTags}
            onTagsChange={(tags) => onDraftChange({ ...draft, targetTags: tags })}
            countMap={tagCountMap}
            activeCount={activeCount}
            unsubscribedCount={unsubscribedCount}
            recipients={recipients}
            directInput={directInput}
            onDirectInputChange={setDirectInput}
            directEmails={directEmails}
            activeSegment={activeSegment}
            savedSegments={savedSegmentViews}
            onApplySegment={onApplySegment}
          />

          <ChannelCascadeCard
            emailReach={emailReach}
            phoneReach={phoneReach}
            messagingStatus={messagingStatus}
            messagingStatusLoaded={messagingStatusLoaded}
            onOpenKakaoTest={openKakaoTest}
          />

          <MessageComposeCard
            draft={draft}
            onChange={onDraftChange}
            recipients={recipients}
            variables={variables}
            templates={messagingStatus?.templates ?? []}
            messagingStatusLoaded={messagingStatusLoaded}
            onOpenKakaoTest={openKakaoTest}
          />

          {/* 알림톡 테스트 발송 패널 — 대량 발송이 아닌 테스트 전용(KakaoComposer 승계) */}
          {kakaoTestOpen && (
            <section
              ref={kakaoPanelRef}
              className="scroll-mt-28 overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white"
            >
              <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-4 py-3.5 sm:px-5">
                <h3 className="text-[14px] font-bold text-[#111110]">알림톡 테스트 발송</h3>
                <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-semibold text-[#A8741A]">
                  테스트 전용
                </span>
                <span className="hidden text-[11px] text-[#1a1a1a]/40 sm:inline">
                  지정 번호 1건 — 대량 발송은 백엔드 준비 중
                </span>
                <button
                  type="button"
                  onClick={() => setKakaoTestManual(false)}
                  aria-label="알림톡 테스트 패널 닫기"
                  className="ml-auto rounded-md p-1 text-[#1a1a1a]/35 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="px-4 py-4 sm:px-5">
                <KakaoComposer
                  templates={messagingStatus?.templates ?? []}
                  channelRegistered={(messagingStatus?.kakaoChannels?.length ?? 0) > 0}
                  statusUnavailable={!messagingStatusLoaded || messagingStatus === null}
                  initialTestPhone={recipientPrefill?.phone}
                />
              </div>
            </section>
          )}
        </div>

        {/* ── 우측 레일 ─────────────────────────────── */}
        <div className="space-y-4">
          <SendInvoiceRail
            draft={draft}
            audienceMode={audienceMode}
            directEmails={directEmails}
            audienceCount={audienceCount}
            checks={checks}
            readiness={readiness}
            balance={messagingStatus?.balance ?? null}
            messagingStatusLoaded={messagingStatusLoaded}
            onSend={onSend}
            sendLoading={sendLoading}
          />

          {/* 저장 세그먼트 — 허브 소유 상태(localStorage)를 그대로 조작 */}
          <section className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-[#111110]">저장 세그먼트</h3>
              {activeSegment && (
                <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#084734]">
                  적용 중
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                value={segmentName}
                onChange={(event) => onSegmentNameChange(event.target.value)}
                placeholder="예) 원장 + VIP"
                className="text-[12.5px]"
              />
              <Button
                type="button"
                size="sm"
                onClick={onSaveSegment}
                className="bg-[#084734] text-white hover:bg-[#065c41]"
                disabled={draft.targetTags.length === 0}
              >
                저장
              </Button>
            </div>

            {savedSegmentViews.length === 0 ? (
              <p className="py-5 text-center text-[11.5px] text-[#1a1a1a]/30">
                태그를 고른 뒤 이름을 붙여 저장해보세요.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {savedSegmentViews.map((segment) => {
                  const isActive = activeSegment?.id === segment.id
                  return (
                    <div
                      key={segment.id}
                      className={`rounded-xl border px-3 py-2.5 ${
                        isActive ? "border-[#084734]/30 bg-[#ECFDF5]/60" : "border-[#e8e8e4] bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[12.5px] font-semibold text-[#111110]">
                          {segment.name}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-[#1a1a1a]/40">
                          {segment.recipientCount}명
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {segment.targetTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onApplySegment(segment)}
                          className="rounded-lg border border-[#e8e8e4] bg-white px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#084734]/35 hover:text-[#084734]"
                        >
                          적용
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSegment(segment)}
                          className="rounded-lg border border-[#e8e8e4] bg-white px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/45 transition-colors hover:border-[#F2B8B8] hover:text-[#8F2C2C]"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
