"use client"

import { useState } from "react"
import { Zap, Clock, Timer, Search } from "lucide-react"
import type { AutomationRule, AutomationLog } from "@/lib/automation-types"

interface Props {
  rules: AutomationRule[]
  logs: AutomationLog[]                  // 마지막 실행 정보 조회용
  selectedId?: string
  onSelect: (rule: AutomationRule) => void
}

const TRIGGER_ICONS = { on_submit: Zap, scheduled: Clock, delay: Timer }
const TRIGGER_LABELS = { on_submit: "폼 제출 즉시", scheduled: "스케줄", delay: "지연 발송" }

const STATUS_BAR: Record<string, string> = {
  active: "bg-green-400",
  paused: "bg-yellow-300",
  draft:  "bg-[#e8e8e4]",
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  paused: "bg-yellow-50 text-yellow-700",
  draft:  "bg-[#f0f0ec] text-[#1a1a1a]/40",
}

const STATUS_LABELS: Record<string, string> = {
  active: "활성",
  paused: "일시정지",
  draft:  "초안",
}

function segmentSummary(rule: AutomationRule): string {
  const seg = rule.segmentConfig
  const parts: string[] = []
  const tableMap: Record<string, string> = { both: "리드+구독자", leads: "리드", subscribers: "구독자" }
  parts.push(tableMap[seg.targetTable ?? "both"])
  if (seg.sources?.length) {
    const srcMap: Record<string, string> = { demo_modal: "데모신청", contact_page: "문의", newsletter: "뉴스레터", manual: "수동" }
    parts.push(seg.sources.map((s) => srcMap[s] ?? s).join("/"))
  }
  if (seg.tags?.length) parts.push(seg.tags.slice(0, 2).join(", ") + (seg.tags.length > 2 ? " 외" : ""))
  if (seg.daysSinceSubmit) parts.push(`최근 ${seg.daysSinceSubmit}일`)
  return parts.join(" · ") || "전체 대상"
}

function triggerDetail(rule: AutomationRule): string {
  const cfg = rule.triggerConfig
  if (cfg.type === "scheduled") return cfg.cron
  if (cfg.type === "delay") return `${cfg.hours}h 후`
  return ""
}

function lastRunInfo(ruleId: string, logs: AutomationLog[]): string {
  const ruleLogs = logs.filter((l) => l.ruleId === ruleId && l.status === "sent")
  if (ruleLogs.length === 0) return "아직 실행 없음"
  const last = ruleLogs[0]
  const diff = Date.now() - new Date(last.triggeredAt).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const ago = days > 0 ? `${days}일 전` : hours > 0 ? `${hours}시간 전` : mins > 0 ? `${mins}분 전` : "방금"
  return `${ago} · ${last.recipientCount}명 발송`
}

export default function AutomationRuleList({ rules, logs, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filtered = rules.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || r.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="flex flex-col h-full">
      {/* 검색 + 필터 */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#1a1a1a]/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="규칙 검색..."
            className="w-full pl-8 pr-3 h-8 rounded-lg border border-[#e8e8e4] bg-white text-[12px] placeholder:text-[#1a1a1a]/30 focus:outline-none focus:border-[#c8c8c4]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 px-2.5 rounded-lg border border-[#e8e8e4] bg-white text-[12px] text-[#1a1a1a]/70 focus:outline-none focus:border-[#c8c8c4]"
        >
          <option value="all">전체</option>
          <option value="active">활성</option>
          <option value="paused">일시정지</option>
          <option value="draft">초안</option>
        </select>
      </div>

      {/* 규칙 카드 목록 */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[#1a1a1a]/30">
            <Zap className="w-7 h-7 mx-auto mb-2 opacity-25" />
            <p className="text-[12px]">
              {rules.length === 0 ? "등록된 규칙이 없습니다." : "조건에 맞는 규칙이 없습니다."}
            </p>
          </div>
        ) : (
          filtered.map((rule) => {
            const TriggerIcon = TRIGGER_ICONS[rule.triggerType]
            const isSelected = selectedId === rule.id
            const detail = triggerDetail(rule)

            return (
              <button
                key={rule.id}
                onClick={() => onSelect(rule)}
                className={`w-full text-left rounded-xl border overflow-hidden transition-all ${
                  isSelected
                    ? "border-[#084734] shadow-sm bg-white"
                    : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4] hover:shadow-sm"
                }`}
              >
                <div className="flex items-stretch">
                  {/* 상태 컬러 바 (좌측 3px) */}
                  <div className={`w-[3px] flex-shrink-0 ${STATUS_BAR[rule.status]}`} />

                  {/* 카드 내용 */}
                  <div className="flex-1 px-3 py-3 min-w-0">
                    {/* 이름 + 상태 뱃지 */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-[#084734]/10" : "bg-[#f0f0ec]"
                      }`}>
                        <TriggerIcon className={`w-3.5 h-3.5 ${isSelected ? "text-[#084734]" : "text-[#1a1a1a]/50"}`} />
                      </div>
                      <p className="text-[13px] font-semibold text-[#111110] truncate flex-1">{rule.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[rule.status]}`}>
                        {STATUS_LABELS[rule.status]}
                      </span>
                    </div>

                    {/* 트리거 · 세그먼트 요약 */}
                    <p className="text-[11px] text-[#1a1a1a]/50 truncate mb-1">
                      {TRIGGER_LABELS[rule.triggerType]}
                      {detail && <span className="font-mono ml-1 text-[10px]">({detail})</span>}
                      <span className="mx-1">·</span>
                      {segmentSummary(rule)}
                    </p>

                    {/* 마지막 실행 */}
                    <p className="text-[10px] text-[#1a1a1a]/35">
                      {lastRunInfo(rule.id, logs)}
                    </p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
