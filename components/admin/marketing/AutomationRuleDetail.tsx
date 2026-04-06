"use client"

import { Zap, Clock, Timer, Play, Pause, Trash2, Edit2, Mail, ChevronRight, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AutomationRule, AutomationLog } from "@/lib/automation-types"

interface Props {
  rule: AutomationRule | null
  logs: AutomationLog[]
  triggeringId?: string
  onEdit: (rule: AutomationRule) => void
  onDelete: (rule: AutomationRule) => void
  onToggleStatus: (rule: AutomationRule) => void
  onTrigger: (rule: AutomationRule) => void
  onShowAllLogs: () => void
  onCreateFirst: () => void
}

const TRIGGER_ICONS = { on_submit: Zap, scheduled: Clock, delay: Timer }
const TRIGGER_LABELS = { on_submit: "폼 제출 즉시", scheduled: "스케줄 발송", delay: "지연 발송" }

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-yellow-50 text-yellow-700 border-yellow-200",
  draft:  "bg-[#f0f0ec] text-[#1a1a1a]/40 border-[#e8e8e4]",
}
const STATUS_LABELS: Record<string, string> = { active: "활성", paused: "일시정지", draft: "초안" }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#1a1a1a]/30 uppercase tracking-widest mb-2">{children}</p>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-[11px] text-[#1a1a1a]/40 w-16 flex-shrink-0">{label}</span>
      <span className="text-[12px] text-[#111110]">{value}</span>
    </div>
  )
}

function formatTrigger(rule: AutomationRule): string {
  const cfg = rule.triggerConfig
  if (cfg.type === "scheduled") return `cron: ${cfg.cron}`
  if (cfg.type === "delay") return `제출 ${cfg.hours}시간 후`
  return "제출 즉시"
}

function formatSegment(rule: AutomationRule): { label: string; value: string }[] {
  const s = rule.segmentConfig
  const tableMap: Record<string, string> = { both: "리드 + 구독자", leads: "리드만", subscribers: "구독자만" }
  const srcMap: Record<string, string> = { demo_modal: "데모신청", contact_page: "문의페이지", newsletter: "뉴스레터", manual: "수동" }
  const statusMap: Record<string, string> = { new: "신규", contacted: "연락됨", converted: "전환", closed: "종료" }
  return [
    { label: "대상", value: tableMap[s.targetTable ?? "both"] },
    { label: "유입", value: s.sources?.length ? s.sources.map((v) => srcMap[v] ?? v).join(", ") : "전체" },
    { label: "리드상태", value: s.leadStatuses?.length ? s.leadStatuses.map((v) => statusMap[v] ?? v).join(", ") : "전체" },
    { label: "태그", value: s.tags?.length ? s.tags.join(", ") : "전체" },
    { label: "기간", value: s.daysSinceSubmit ? `최근 ${s.daysSinceSubmit}일` : "전체 기간" },
  ]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// ─── 빈 상태 ─────────────────────────────────────────────────
function EmptyState({ onCreateFirst }: { onCreateFirst: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-[#f0f0ec] flex items-center justify-center mb-4">
        <Zap className="w-5 h-5 text-[#1a1a1a]/30" />
      </div>
      <p className="text-[14px] font-semibold text-[#111110] mb-1">자동화 규칙을 선택하거나</p>
      <p className="text-[13px] text-[#1a1a1a]/40 mb-6">새 규칙을 만들어보세요.</p>
      <Button size="sm" onClick={onCreateFirst}>
        <Zap className="w-3.5 h-3.5 mr-1.5" />
        첫 규칙 만들기
      </Button>
    </div>
  )
}

// ─── 메인 ────────────────────────────────────────────────────
export default function AutomationRuleDetail({
  rule, logs, triggeringId,
  onEdit, onDelete, onToggleStatus, onTrigger, onShowAllLogs, onCreateFirst,
}: Props) {
  if (!rule) return (
    <div className="flex-1 bg-white rounded-xl border border-[#e8e8e4] flex flex-col">
      <EmptyState onCreateFirst={onCreateFirst} />
    </div>
  )

  const TriggerIcon = TRIGGER_ICONS[rule.triggerType]
  const isTriggering = triggeringId === rule.id
  const recentLogs = logs.filter((l) => l.ruleId === rule.id).slice(0, 5)
  const segRows = formatSegment(rule)

  return (
    <div className="flex-1 bg-white rounded-xl border border-[#e8e8e4] flex flex-col overflow-hidden">

      {/* ── 헤더 ── */}
      <div className="px-6 pt-5 pb-4 border-b border-[#e8e8e4]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#084734]/10 flex items-center justify-center flex-shrink-0">
              <TriggerIcon className="w-4 h-4 text-[#084734]" />
            </div>
            <h2 className="text-[15px] font-bold text-[#111110] truncate">{rule.name}</h2>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onEdit(rule)}>
              <Edit2 className="w-3 h-3 mr-1" />편집
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-red-400 hover:text-red-500 hover:border-red-200"
              onClick={() => onDelete(rule)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[rule.status]}`}>
            {STATUS_LABELS[rule.status]}
          </span>
          <span className="text-[11px] text-[#1a1a1a]/35">
            {new Date(rule.createdAt).toLocaleDateString("ko-KR")} 생성
          </span>
        </div>
      </div>

      {/* ── 내용 (스크롤 가능) ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* 트리거 */}
        <div>
          <SectionLabel>트리거</SectionLabel>
          <div className="bg-[#FAFAF8] rounded-lg border border-[#e8e8e4] px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <TriggerIcon className="w-3.5 h-3.5 text-[#084734]" />
              <span className="text-[12px] font-semibold text-[#111110]">{TRIGGER_LABELS[rule.triggerType]}</span>
            </div>
            <p className="text-[11px] text-[#1a1a1a]/50 font-mono">{formatTrigger(rule)}</p>
          </div>
        </div>

        {/* 세그먼트 */}
        <div>
          <SectionLabel>세그먼트</SectionLabel>
          <div className="space-y-0 divide-y divide-[#e8e8e4]/60">
            {segRows.map(({ label, value }) => (
              <InfoRow key={label} label={label} value={value} />
            ))}
          </div>
        </div>

        {/* 템플릿 */}
        {rule.template && (
          <div>
            <SectionLabel>이메일 템플릿</SectionLabel>
            <div className="bg-[#FAFAF8] rounded-lg border border-[#e8e8e4] px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#084734]" />
                  <span className="text-[12px] font-semibold text-[#111110]">{rule.template.name}</span>
                </div>
              </div>
              <p className="text-[11px] text-[#1a1a1a]/50 mt-1 truncate">{rule.template.subject}</p>
            </div>
          </div>
        )}

        {/* 최근 실행 로그 */}
        <div>
          <SectionLabel>최근 실행</SectionLabel>
          {recentLogs.length === 0 ? (
            <p className="text-[11px] text-[#1a1a1a]/30">아직 실행 이력이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-2.5">
                  {log.status === "sent"
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  }
                  <span className="text-[11px] text-[#1a1a1a]/50 flex-1">{formatDate(log.triggeredAt)}</span>
                  {log.status === "sent"
                    ? <span className="text-[11px] font-medium text-[#111110]">{log.recipientCount}명</span>
                    : <span className="text-[10px] text-red-400 truncate max-w-[120px]">{log.errorMessage ?? "실패"}</span>
                  }
                </div>
              ))}
            </div>
          )}
          {recentLogs.length > 0 && (
            <button
              onClick={onShowAllLogs}
              className="mt-2 flex items-center gap-1 text-[11px] text-[#084734] hover:underline"
            >
              전체 이력 보기 <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── 푸터 액션 ── */}
      <div className="px-6 py-4 border-t border-[#e8e8e4] flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 bg-[#111110] hover:bg-[#1a1a1a] text-white"
          onClick={() => onTrigger(rule)}
          disabled={isTriggering}
        >
          {isTriggering ? (
            <span className="animate-pulse">발송 중...</span>
          ) : (
            <><Play className="w-3.5 h-3.5 mr-1.5" />지금 즉시 실행</>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onToggleStatus(rule)}
        >
          {rule.status === "active"
            ? <><Pause className="w-3.5 h-3.5 mr-1.5" />일시정지</>
            : <><Play className="w-3.5 h-3.5 mr-1.5 text-green-600" />활성화</>
          }
        </Button>
      </div>
    </div>
  )
}
