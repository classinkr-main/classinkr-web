"use client"

import { useState } from "react"
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react"
import type { AutomationLog, AutomationRule } from "@/lib/automation-types"

interface Props {
  logs: AutomationLog[]
  rules: AutomationRule[]
}

const STATUS_CONFIG = {
  sent:    { icon: CheckCircle, color: "text-green-500",  bg: "bg-green-50",  label: "발송 완료" },
  failed:  { icon: XCircle,    color: "text-red-400",    bg: "bg-red-50",    label: "실패" },
  pending: { icon: Clock,      color: "text-yellow-500", bg: "bg-yellow-50", label: "진행 중" },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function AutomationLogTable({ logs, rules }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [ruleFilter, setRuleFilter]   = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filtered = logs.filter((l) => {
    const matchRule   = ruleFilter   === "all" || l.ruleId   === ruleFilter
    const matchStatus = statusFilter === "all" || l.status   === statusFilter
    return matchRule && matchStatus
  })

  if (logs.length === 0) {
    return (
      <div className="text-center py-16 text-[#1a1a1a]/30">
        <Clock className="w-7 h-7 mx-auto mb-2 opacity-25" />
        <p className="text-[12px]">실행 이력이 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {/* 필터 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e8e8e4] bg-[#FAFAF8]">
        <select
          value={ruleFilter}
          onChange={(e) => setRuleFilter(e.target.value)}
          className="h-7 px-2.5 rounded-lg border border-[#e8e8e4] bg-white text-[11px] text-[#1a1a1a]/70 focus:outline-none focus:border-[#c8c8c4]"
        >
          <option value="all">전체 규칙</option>
          {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-7 px-2.5 rounded-lg border border-[#e8e8e4] bg-white text-[11px] text-[#1a1a1a]/70 focus:outline-none focus:border-[#c8c8c4]"
        >
          <option value="all">전체 상태</option>
          <option value="sent">발송 완료</option>
          <option value="failed">실패</option>
          <option value="pending">진행 중</option>
        </select>
        <span className="text-[11px] text-[#1a1a1a]/30 ml-auto">총 {filtered.length}건</span>
      </div>

      {/* 테이블 */}
      <div className="divide-y divide-[#e8e8e4]/60">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-[12px] text-[#1a1a1a]/30">조건에 맞는 이력이 없습니다.</div>
        ) : (
          filtered.map((log) => {
            const cfg = STATUS_CONFIG[log.status]
            const StatusIcon = cfg.icon
            const isExpanded = expandedId === log.id

            return (
              <div key={log.id}>
                {/* 행 */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF8] transition-colors text-left"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {/* 상태 */}
                  <div className={`flex items-center gap-1.5 w-24 flex-shrink-0`}>
                    <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>

                  {/* 규칙명 */}
                  <span className="text-[12px] text-[#111110] flex-1 truncate min-w-0">
                    {log.ruleName ?? "알 수 없는 규칙"}
                  </span>

                  {/* 발송 수 */}
                  <div className="w-16 flex-shrink-0 text-right">
                    <span className="text-[13px] font-semibold text-[#084734]">{log.recipientCount}</span>
                    <span className="text-[11px] text-[#1a1a1a]/40 ml-0.5">명</span>
                  </div>

                  {/* 시각 */}
                  <span className="text-[11px] text-[#1a1a1a]/50 w-28 flex-shrink-0 text-right">
                    {formatDate(log.triggeredAt)}
                  </span>

                  {/* 펼침 화살표 */}
                  <div className="w-4 flex-shrink-0">
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-[#1a1a1a]/30" />
                      : <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/20" />
                    }
                  </div>
                </button>

                {/* 아코디언 펼침 */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-[#FAFAF8] border-t border-[#e8e8e4]/40">
                    {log.status === "failed" && log.errorMessage && (
                      <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-semibold text-red-600 mb-0.5">오류 메시지</p>
                          <p className="text-[11px] text-red-500 font-mono break-all">{log.errorMessage}</p>
                        </div>
                      </div>
                    )}

                    {log.recipientEmails && log.recipientEmails.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-[#1a1a1a]/40 uppercase tracking-wide mb-1.5">수신자</p>
                        <div className="flex flex-wrap gap-1.5">
                          {log.recipientEmails.map((email) => (
                            <span key={email} className="text-[10px] font-mono px-2 py-0.5 bg-white border border-[#e8e8e4] rounded-full text-[#1a1a1a]/60">
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {log.status === "sent" && (!log.recipientEmails || log.recipientEmails.length === 0) && (
                      <p className="mt-3 text-[11px] text-[#1a1a1a]/30">수신자 상세 정보 없음</p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
