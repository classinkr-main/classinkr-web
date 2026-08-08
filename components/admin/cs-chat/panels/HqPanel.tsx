"use client"

import { Building, CheckCircle2, ChevronRight, Clock, Copy, Loader2, MessageSquare } from "lucide-react"

import { cn } from "@/lib/utils"

import StatusBadge from "../components/StatusBadge"
import { CONSOLE_CONTENT_CLASS } from "../constants"
import { buildHqTemplate, formatDay } from "../formatters"
import { formatWaitingElapsed, hqWaitingSince, isHqStale } from "../hq-desk"
import type { ConversationDetailResponse, InternalCsConversation } from "../types"

// 본사 확인(§6) — 신규 테이블·API 없이 tags[]만으로 세운 화면.
// 목록은 워크스페이스가 이미 받아 둔 conversations(status=all 한 번 받은 응답)를
// evidence:hq_pending으로 거른 것이고, 펼침 본문은 기존 buildHqTemplate()의 6항목 고정 포맷을 그대로 쓴다.
export default function HqPanel({
  conversations,
  detailError,
  expandedId,
  expandedDetail,
  busyId,
  onToggleRow,
  onCopy,
  onOpenConversation,
  onResolve,
}: {
  conversations: InternalCsConversation[]
  detailError: string | null
  expandedId: string | null
  expandedDetail: ConversationDetailResponse | null
  busyId: string | null
  onToggleRow: (id: string) => void
  onCopy: (text: string, success: string) => void
  onOpenConversation: (conversation: InternalCsConversation) => void
  onResolve: (conversation: InternalCsConversation) => void
}) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-white">
      <div className={cn(CONSOLE_CONTENT_CLASS, "py-6")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">본사 확인</h2>
            <p className="mt-1 max-w-[640px] text-[12px] leading-5 text-[#615D59]">
              본사 회신을 기다리는 대화입니다. 행을 펼치면 6항목 고정 포맷 요청 초안이 그대로 나옵니다.
              이 화면의 내용은 사내 전용이며 고객 안내 문안과 섞지 마세요.
            </p>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#F6F5F4] px-3 text-[12px] font-semibold text-[#31302E]">
            대기
            <span className="tabular-nums text-[#615D59]">{conversations.length}</span>
          </span>
        </div>
        {/* 근사 명시 — 대기 시작 시각을 저장하는 칼럼이 없다(hq-desk.ts hqWaitingSince). */}
        <p className="mt-3 rounded-md border border-black/[0.08] bg-[#FAFAF8] px-3 py-2 text-[11px] leading-4 text-[#615D59]">
          대기 경과는 마지막 업데이트 시각(updated_at) 기준 <strong className="font-semibold text-[#31302E]">근사값</strong>입니다.
          태그가 붙은 시각은 따로 저장하지 않으므로, 이후 담당자·상태·제목을 바꾸면 경과가 다시 0부터 계산됩니다.
        </p>
        {detailError ? (
          <p className="mt-3 rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[11.5px] text-[#8F2C2C]">
            {detailError}
          </p>
        ) : null}
      </div>

      {conversations.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center border-t border-black/[0.08] px-6 text-center">
          <Building className="h-8 w-8 text-[#A39E98]" />
          <p className="mt-4 text-[14px] font-semibold text-[#31302E]">본사 회신을 기다리는 건이 없습니다.</p>
          <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-[#615D59]">
            대기열이나 내부 상담에서 <span className="font-semibold text-[#31302E]">본사 확인 요청</span>을 누르면 이곳에 쌓입니다.
          </p>
        </div>
      ) : (
        <div className="border-t border-black/[0.08]">
          {conversations.map((conversation) => {
            const expanded = expandedId === conversation.id
            const since = hqWaitingSince(conversation)
            const stale = isHqStale(since)
            const busy = busyId === conversation.id
            const rowDetail = expanded ? expandedDetail : null
            return (
              <article key={conversation.id} className="border-b border-black/[0.08] bg-white">
                <button
                  type="button"
                  onClick={() => onToggleRow(conversation.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 sm:px-6"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "mt-1 h-4 w-4 shrink-0 text-[#A39E98] transition-transform",
                      expanded && "rotate-90"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-[#111110]">{conversation.title}</span>
                      <StatusBadge status={conversation.status} />
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#615D59]">
                      <span>담당 {conversation.assignee_name ?? "미지정"}</span>
                      <span className="text-[#D8D5D1]" aria-hidden>·</span>
                      <span>등록 {formatDay(conversation.created_at)}</span>
                      <span className="text-[#D8D5D1]" aria-hidden>·</span>
                      <span className="truncate text-[#A39E98]">
                        {conversation.tags.length > 0 ? conversation.tags.join(" · ") : "분류 전"}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#A39E98]">대기 경과</span>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums",
                        stale ? "text-[#7A520F]" : "text-[#31302E]"
                      )}
                    >
                      {stale ? <Clock className="h-3.5 w-3.5" aria-hidden /> : null}
                      {formatWaitingElapsed(since)}
                    </span>
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-4 sm:px-6">
                    {rowDetail ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#31302E]">
                            본사 요청 초안 · 6항목 고정 포맷
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onCopy(buildHqTemplate(rowDetail), "본사 확인 초안을 복사했습니다.")}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[11px] font-semibold hover:bg-[#F6F5F4]"
                            >
                              <Copy className="h-3 w-3" />
                              초안 복사
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenConversation(conversation)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[11px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
                            >
                              <MessageSquare className="h-3 w-3" />
                              대화 열기
                            </button>
                            <button
                              type="button"
                              onClick={() => onResolve(conversation)}
                              disabled={busy}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#065C41] disabled:cursor-not-allowed disabled:bg-[#A39E98]"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              본사 확인 완료
                            </button>
                          </div>
                        </div>
                        <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-black/[0.08] bg-white px-3.5 py-3 font-sans text-[11.5px] leading-5 text-[#31302E]">
                          {buildHqTemplate(rowDetail)}
                        </pre>
                        <p className="mt-2 text-[10.5px] leading-4 text-[#A39E98]">
                          회신을 받으면 본사 확인 완료를 눌러 주세요 — 근거 태그가 확정으로 바뀌고 이 목록에서 빠집니다.
                        </p>
                      </>
                    ) : (
                      <p className="flex items-center gap-2 py-3 text-[12px] text-[#615D59]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        본사 요청 초안을 준비하는 중입니다.
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
