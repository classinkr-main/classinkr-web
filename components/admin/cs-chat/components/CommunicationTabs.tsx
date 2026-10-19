"use client"

import { useMemo, useState } from "react"
import {
  CheckCircle2,
  Copy,
  Globe2,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from "lucide-react"

import {
  buildSmartCustomerDraft,
  buildSmartHandoffMessage,
  buildSmartHqDraft,
  extractEscalationContext,
} from "@/lib/internal-cs-chat/escalation-routing"
import { cn } from "@/lib/utils"

import EscalationWhoBadge from "./EscalationWhoBadge"
import type { ConversationDetailResponse } from "../types"

export type CommunicationTabId = "customer" | "hq" | "handoff"

export default function CommunicationTabs({
  detail,
  isApproved,
  onOpenReview,
  onCopyText,
  legacyTemplates,
  className,
}: {
  detail: ConversationDetailResponse | null
  isApproved: boolean
  onOpenReview: () => void
  onCopyText: (text: string, label: string) => void
  legacyTemplates?: Array<{ id: string; label: string; content: string }>
  className?: string
}) {
  const [activeTab, setActiveTab] = useState<CommunicationTabId>("customer")
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 1. 대화 맥락에서 스마트 에스컬레이션 컨텍스트 자동 추출
  const context = useMemo(() => {
    if (!detail) return null
    const allUserTexts = detail.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n")
    const assistantTexts = detail.messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n")
    const combined = `${allUserTexts}\n${assistantTexts}`

    return extractEscalationContext(combined, {
      title: detail.conversation.title,
      tags: detail.conversation.tags,
      assigneeName: detail.conversation.assignee_name,
      createdDate: detail.conversation.created_at,
    })
  }, [detail])

  // 2. 스마트 3-Way 템플릿 기본 생성
  const defaultTemplates = useMemo(() => {
    if (!context) {
      return {
        customer: legacyTemplates?.find((t) => t.id === "customer" || t.id.includes("customer"))?.content ?? "",
        hq: legacyTemplates?.find((t) => t.id === "hq")?.content ?? "",
        handoff: legacyTemplates?.find((t) => t.id === "handoff")?.content ?? "",
      }
    }

    return {
      customer: buildSmartCustomerDraft(context),
      hq: buildSmartHqDraft(context),
      handoff: buildSmartHandoffMessage(context),
    }
  }, [context, legacyTemplates])

  const tabsConfig = [
    {
      id: "customer" as const,
      label: "고객 카카오톡 안내",
      shortLabel: "고객 안내",
      icon: MessageCircle,
      targetBadge: "외부 전달용 (안전 필터)",
      description: "사실과 추정을 엄격히 분리하고 내부 식별자(IP, 서버명, 에러코드)를 제외한 카카오톡 맞춤 안내문입니다.",
    },
    {
      id: "hq" as const,
      label: "HQ WeCom 보고 (3개국어)",
      shortLabel: "HQ WeCom",
      icon: Globe2,
      targetBadge: `HQ 담당: ${context?.contact.primaryContact ?? "소통팀"}`,
      description: "HQ 보고 템플릿 v2 준수: WeCom 중국어(UTC+8 변환, 완충 어휘) + English + 한국어 참조 3단 구조입니다.",
    },
    {
      id: "handoff" as const,
      label: "사내 CRM 인수인계",
      shortLabel: "사내 인수인계",
      icon: Users,
      targetBadge: "사내 CRM / Notion",
      description: "티켓 ID, 단말 스펙, 증상, 확인된 사실, 다음 조치 액션을 공유하기 위한 내부 인수인계 표준 양식입니다.",
    },
  ]

  const currentContent = editedDrafts[activeTab] ?? defaultTemplates[activeTab] ?? ""
  const isEdited = activeTab in editedDrafts && editedDrafts[activeTab] !== defaultTemplates[activeTab]

  const handleCopy = (id: string, label: string, content: string) => {
    if (!isApproved) {
      onOpenReview()
      return
    }
    onCopyText(content, `${label} 초안을 복사했습니다.`)
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
              소통 초안은 <strong>담당자 검토·승인(허가) 후</strong> 복사할 수 있습니다.
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
            담당자 검토·승인 완료 — 고객 및 본사 전달이 <strong>허가</strong>되었습니다.
          </span>
        </div>
      )}

      {/* 2. HQ 에스컬레이션 라우팅 뱃지 헤더 */}
      {context ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#084734]" />
            <span className="text-[11.5px] font-semibold text-[#31302E]">스마트 라우팅 추천:</span>
            <EscalationWhoBadge
              contact={context.contact}
              issueTypeTag={context.issueTypeTag}
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

            {!isApproved ? (
              <span className="inline-flex items-center gap-1 rounded-sm bg-[#F6F5F4] px-2 py-1 text-[10px] font-medium text-[#A39E98]">
                <LockKeyhole className="h-3 w-3" />
                승인 필요
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
              disabled={!isApproved}
              title={isApproved ? "초안 복사" : "담당자 승인 후 복사 가능합니다"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition-all shadow-xs",
                isApproved
                  ? "border-[#084734] bg-[#084734] text-white hover:bg-[#065C41] active:scale-[0.98]"
                  : "cursor-not-allowed border-black/[0.08] bg-[#F6F5F4] text-[#A39E98] opacity-60"
              )}
            >
              {copiedId === activeTab ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  복사 완료
                </>
              ) : isApproved ? (
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
