"use client"

import { useCallback, useMemo, useState } from "react"
import {
  CheckCircle2,
  Copy,
  Globe2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"

import { redactionNotice } from "@/lib/internal-cs-chat/redact"
import { cn } from "@/lib/utils"

import EscalationWhoBadge from "./EscalationWhoBadge"
import {
  buildCustomerDraftBase,
  hasDraftPlaceholder,
  prepareInternalDraftCopy,
} from "../formatters"
import type { ConversationDetailResponse } from "../types"
import { useEscalation } from "../use-escalation"

export type CommunicationTabId = "customer" | "hq" | "handoff"

// 소통 초안 편집본은 이 패널이 접히면(언마운트) 사라졌다(IC-11). 탭 메모리에만 대화별로 남긴다 —
// 브라우저 저장소에는 쓰지 않는다(고객 글이 섞인 초안을 디스크에 남기지 않기 위해). 새로고침하면 비워진다.
const editedDraftMemory = new Map<string, Record<string, string>>()

export function recallCommunicationDrafts(conversationId: string | null) {
  return (conversationId && editedDraftMemory.get(conversationId)) || {}
}

export function rememberCommunicationDrafts(conversationId: string, drafts: Record<string, string>) {
  if (Object.keys(drafts).length > 0) editedDraftMemory.set(conversationId, drafts)
  else editedDraftMemory.delete(conversationId)
}

/** 시험용: 대화별 편집본 메모리를 비운다. */
export function resetCommunicationDraftMemory() {
  editedDraftMemory.clear()
}

// 사내용 탭(본사·인수인계)은 승인 잠금 없이 복사한다. 고객 탭만 승인과 채울 자리 검사를 거친다.
const INTERNAL_TABS = new Set<CommunicationTabId>(["hq", "handoff"])

export default function CommunicationTabs({
  detail,
  isApproved,
  onOpenReview,
  onCopyText,
  legacyTemplates,
  className,
  defaultTab = "customer",
}: {
  detail: ConversationDetailResponse | null
  isApproved: boolean
  onOpenReview: () => void
  onCopyText: (text: string, label: string) => void
  legacyTemplates?: Array<{ id: string; label: string; content: string }>
  className?: string
  defaultTab?: CommunicationTabId
}) {
  const conversationId = detail?.conversation.id ?? null
  const [activeTab, setActiveTab] = useState<CommunicationTabId>(defaultTab)
  const [editedState, setEditedState] = useState<{ id: string | null; drafts: Record<string, string> }>(() => ({
    id: conversationId,
    drafts: recallCommunicationDrafts(conversationId),
  }))
  // 대화가 바뀌면 그 대화의 편집본으로 갈아 끼운다(렌더 중 상태 맞추기).
  if (editedState.id !== conversationId) {
    setEditedState({ id: conversationId, drafts: recallCommunicationDrafts(conversationId) })
  }
  const editedDrafts = editedState.id === conversationId ? editedState.drafts : {}
  const setEditedDrafts = useCallback(
    (update: (prev: Record<string, string>) => Record<string, string>) => {
      setEditedState((prev) => {
        const drafts = update(prev.drafts)
        if (prev.id) rememberCommunicationDrafts(prev.id, drafts)
        return { id: prev.id, drafts }
      })
    },
    []
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 1. 본사 담당 분류·본사/인수인계 초안은 서버가 만든다(B2 — 담당 표는 server-only). 입력은 사용자 글·
  //    customer_context·대화 메타만(AI 답 글 제외 — IC-02).
  const escalation = useEscalation(detail)
  const context = escalation.result?.context ?? null
  const customerBase = useMemo(() => buildCustomerDraftBase(detail), [detail])

  // 2. 탭별 기본 초안. 고객 탭은 승인된 교정본, 없으면 대기 안내 틀이다.
  const defaultTemplates = useMemo(() => {
    if (!detail) {
      return {
        customer: legacyTemplates?.find((t) => t.id === "customer" || t.id.includes("customer"))?.content ?? "",
        hq: legacyTemplates?.find((t) => t.id === "hq")?.content ?? "",
        handoff: legacyTemplates?.find((t) => t.id === "handoff")?.content ?? "",
      }
    }

    return {
      customer: customerBase.text,
      hq: escalation.result?.hqDraft ?? "",
      handoff: escalation.result?.handoffDraft ?? "",
    }
  }, [detail, escalation.result, customerBase, legacyTemplates])
  const redactionCount = (context?.redactionCount ?? 0) + (activeTab === "customer" ? customerBase.redactionCount : 0)
  const notice = activeTab === "customer" && customerBase.source === "holding" ? null : redactionNotice(redactionCount)

  const tabsConfig = [
    {
      id: "customer" as const,
      label: "고객 카카오톡 안내",
      shortLabel: "고객 안내",
      icon: MessageCircle,
      targetBadge: "외부 전달용 · 승인 후 복사",
      description:
        customerBase.source === "approved"
          ? "담당자가 승인한 최종 답입니다. 전화·이메일·계좌·계정 ID는 가렸고, 이름·주소는 직접 확인해 주세요."
          : "승인된 답이 없어 대기 안내 틀을 넣었습니다. [ ] 자리를 채워야 복사할 수 있습니다.",
    },
    {
      id: "hq" as const,
      label: "HQ WeCom 보고 (3개국어)",
      shortLabel: "HQ WeCom",
      icon: Globe2,
      targetBadge: `HQ 담당: ${context?.contact.primaryContact ?? "소통팀"}`,
      description:
        "사내용 본사 보고 초안(중국어·영어·한국어)입니다. 승인 없이 복사할 수 있고, 복사할 때 전화·이메일·계좌·계정 ID를 가립니다.",
    },
    {
      id: "handoff" as const,
      label: "사내 CRM 인수인계",
      shortLabel: "사내 인수인계",
      icon: Users,
      targetBadge: "사내 CRM / Notion",
      description: "사내 인수인계 양식입니다. 확인한 사실과 고객 안내 상태는 [확인 후 입력] 자리에 직접 적어 주세요.",
    },
  ]

  const currentContent = editedDrafts[activeTab] ?? defaultTemplates[activeTab] ?? ""
  const isEdited = activeTab in editedDrafts && editedDrafts[activeTab] !== defaultTemplates[activeTab]

  const isInternalTab = INTERNAL_TABS.has(activeTab)
  // 사내 탭 초안이 아직 서버에서 오지 않았다(대기·오류). 담당자가 직접 쓴 편집본이 있으면 그것은 복사할 수 있다.
  const internalDraftPending = Boolean(detail) && isInternalTab && escalation.status !== "ready" && !(activeTab in editedDrafts)
  const customerHasPlaceholder = activeTab === "customer" && hasDraftPlaceholder(currentContent)
  const copyBlockedReason = isInternalTab
    ? internalDraftPending
      ? escalation.status === "error"
        ? "초안을 불러오지 못했습니다. 다시 시도해 주세요"
        : "초안을 만드는 중입니다"
      : null
    : !isApproved
      ? "담당자 승인 후 복사 가능합니다"
      : customerHasPlaceholder
        ? "[ ] 자리를 채운 뒤 복사할 수 있습니다"
        : null
  const canCopy = copyBlockedReason === null

  const handleCopy = (id: CommunicationTabId, label: string, content: string) => {
    if (!INTERNAL_TABS.has(id) && !isApproved) {
      onOpenReview()
      return
    }
    if (!canCopy) return
    // 사내 탭은 HqPanel 과 같은 규칙(prepareInternalDraftCopy), 고객 탭도 복사 직전에 한 번 더 가린다.
    onCopyText(prepareInternalDraftCopy(content).text, `${label} 초안을 복사했습니다.`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleReset = () => {
    setEditedDrafts((prev) => {
      const next = { ...prev }
      delete next[activeTab]
      return next
    })
  }

  return (
    <div className={cn("space-y-3.5", className)}>
      {/* 1. 승인 상태 배너 (테스트 계약 및 보안 가드) */}
      {!isApproved ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3 text-[11.5px] text-[#7A520F]">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 shrink-0 text-[#A8741A]" />
            <span>
              고객 안내는 <strong>담당자 검토·승인(허가) 후</strong> 복사할 수 있습니다. 본사·인수인계 초안은 사내용이라 바로 복사됩니다.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenReview}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#7A520F] shadow-xs hover:bg-[#F6E7CE] transition-colors"
          >
            검토·승인 열기
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-4 py-2.5 text-[11.5px] text-[#084734]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            담당자 검토·승인 완료 — 승인된 답을 고객 안내로 복사할 수 있습니다(<strong>허가</strong>).
          </span>
        </div>
      )}

      {/* 2. HQ 에스컬레이션 라우팅 뱃지 헤더 */}
      {detail && escalation.status === "loading" ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-3.5 py-2.5 text-[11.5px] text-[#615D59]"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          본사 담당 추천과 사내 초안을 만드는 중입니다.
        </div>
      ) : null}
      {detail && escalation.status === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3.5 py-2.5 text-[11.5px] text-[#A62626]"
        >
          <span>본사 담당 추천과 사내 초안을 불러오지 못했습니다. {escalation.error}</span>
          <button
            type="button"
            onClick={escalation.retry}
            className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-[#A62626] hover:bg-[#F8DADA]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            다시 시도
          </button>
        </div>
      ) : null}
      {context ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#084734]" />
            <span className="text-[11.5px] font-semibold text-[#31302E]">스마트 라우팅 추천:</span>
            <EscalationWhoBadge
              contact={context.contact}
              issueTypeTag={context.issueTypeTag}
              candidates={context.candidates}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#615D59]">
            {context.beijingTime ? (
              <span className="rounded bg-white px-2 py-0.5 border border-black/[0.06] font-mono">
                {context.beijingTime}
              </span>
            ) : null}
            {context.errorCode ? (
              <span className="rounded bg-[#F6F5F4] px-1.5 py-0.5 font-mono text-[#A62626]">
                Code: {context.errorCode}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 3. 3-Way 실무 소통 탭 UI */}
      <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-xs">
        {/* 탭 헤더 버튼 바 */}
        <div className="flex flex-wrap items-center border-b border-black/[0.08] bg-[#F6F5F4]/60 px-2 pt-2">
          {tabsConfig.map((tab) => {
            const active = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-all -mb-[1px]",
                  active
                    ? "border-[#084734] bg-white text-[#084734] shadow-xs rounded-t-lg"
                    : "border-transparent text-[#615D59] hover:text-[#111110] hover:bg-black/[0.02]"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", active ? "text-[#084734]" : "text-[#A39E98]")} />
                <span>{tab.shortLabel}</span>
              </button>
            )
          })}
        </div>

        {/* 탭 상세 정보 바 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] bg-[#FAFAF8] px-4 py-2 text-[11px] text-[#615D59]">
          <span className="truncate max-w-[500px]">
            {tabsConfig.find((t) => t.id === activeTab)?.description}
          </span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 font-medium text-[#31302E] border border-black/[0.06] shadow-2xs">
              {tabsConfig.find((t) => t.id === activeTab)?.targetBadge}
            </span>
            {isEdited ? (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[#A62626] hover:bg-[#FCE9E9] transition-colors"
                title="스마트 자동 주입 초안으로 되돌리기"
              >
                <RefreshCw className="h-3 w-3" />
                초기화
              </button>
            ) : null}
          </div>
        </div>

        {/* 편집 가능한 에디터 본문 */}
        <div className="p-3.5">
          {notice ? (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-1 text-[11px] font-semibold text-[#7A520F]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {notice}
            </p>
          ) : null}
          <textarea
            value={currentContent}
            onChange={(e) =>
              setEditedDrafts((prev) => ({
                ...prev,
                [activeTab]: e.target.value,
              }))
            }
            rows={12}
            className="w-full resize-y rounded-lg border border-black/[0.10] bg-white p-3 font-mono text-[11.5px] leading-5 text-[#31302E] outline-none transition-all focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
            placeholder="소통 초안을 불러오는 중이거나 내용이 없습니다."
          />
        </div>

        {/* 하단 액션 바 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-[#A39E98]">
            {isEdited ? (
              <span className="inline-flex items-center gap-1 text-[#7A520F]">
                * 수정한 내용이 반영되었습니다.
              </span>
            ) : (
              <span>맥락이 자동 주입된 초안입니다. 필요 시 직접 수정할 수 있습니다.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "hq" ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded bg-[#EBF3F0] px-2 py-1 text-[10px] font-semibold text-[#084734]">
                <Send className="h-3 w-3" />
                WeCom 채널 연동 준비됨
              </span>
            ) : null}

            {copyBlockedReason ? (
              <span className="inline-flex items-center gap-1 rounded-sm bg-[#F6F5F4] px-2 py-1 text-[10px] font-medium text-[#615D59]">
                <LockKeyhole className="h-3 w-3" />
                {isInternalTab ? (escalation.status === "error" ? "불러오기 실패" : "불러오는 중") : !isApproved ? "승인 필요" : "자리 채우기 필요"}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() =>
                handleCopy(
                  activeTab,
                  tabsConfig.find((t) => t.id === activeTab)?.label ?? "소통",
                  currentContent
                )
              }
              disabled={!canCopy}
              title={copyBlockedReason ?? "초안 복사"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition-all shadow-xs",
                canCopy
                  ? "border-[#084734] bg-[#084734] text-white hover:bg-[#065C41] active:scale-[0.98]"
                  : "cursor-not-allowed border-black/[0.08] bg-[#F6F5F4] text-[#A39E98] opacity-60"
              )}
            >
              {copiedId === activeTab ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  복사 완료
                </>
              ) : canCopy ? (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  초안 복사
                </>
              ) : (
                <>
                  <LockKeyhole className="h-3.5 w-3.5" />
                  초안 복사
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
