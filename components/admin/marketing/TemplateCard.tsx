"use client"

import { Mail, Edit2, Copy, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { EmailTemplate, AutomationRule } from "@/lib/automation-types"

interface Props {
  template: EmailTemplate
  rules: AutomationRule[]         // 사용 중인 규칙 수 계산용
  onEdit: (t: EmailTemplate) => void
  onDuplicate: (t: EmailTemplate) => void
  onDelete: (t: EmailTemplate) => void
}

function applyPreview(text: string): string {
  return text
    .replace(/\{name\}/g, "홍길동").replace(/\{org\}/g, "ABC학원")
    .replace(/\{role\}/g, "원장").replace(/\{email\}/g, "sample@abc.kr")
}

export default function TemplateCard({ template, rules, onEdit, onDuplicate, onDelete }: Props) {
  const usedByCount = rules.filter((r) => r.templateId === template.id).length
  const usedBy      = rules.filter((r) => r.templateId === template.id)

  // 본문 텍스트 추출 (HTML 태그 제거, 최대 80자)
  const bodyText = template.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)

  return (
    <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden hover:border-[#c8c8c4] hover:shadow-sm transition-all group">

      {/* 상단 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-[#e8e8e4]/60">
        <div className="flex items-start gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#084734]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Mail className="w-4 h-4 text-[#084734]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111110] truncate">{template.name}</p>
            <p className="text-[11px] text-[#1a1a1a]/50 truncate mt-0.5">{applyPreview(template.subject)}</p>
          </div>
        </div>

        {/* 본문 미리보기 */}
        <p className="text-[11px] text-[#1a1a1a]/40 leading-relaxed line-clamp-2">
          {bodyText || "내용 없음"}{bodyText.length >= 80 && "..."}
        </p>
      </div>

      {/* 하단 메타 + 액션 */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 변수 뱃지 */}
          {template.variables.length > 0 ? (
            <div className="flex gap-1">
              {template.variables.map((v) => (
                <span key={v} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#084734]/8 text-[#084734] rounded">
                  {"{" + v + "}"}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-[#1a1a1a]/25">변수 없음</span>
          )}

          {/* 사용 중 뱃지 */}
          {usedByCount > 0 ? (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex-shrink-0"
              title={usedBy.map((r) => r.name).join(", ")}
            >
              {usedByCount}개 규칙 사용 중
            </span>
          ) : (
            <span className="text-[10px] text-[#1a1a1a]/25 flex-shrink-0">미사용</span>
          )}
        </div>

        {/* 액션 버튼 (hover 시 표시) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => onEdit(template)}>
            <Edit2 className="w-2.5 h-2.5 mr-1" />편집
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-1.5" onClick={() => onDuplicate(template)} title="복제">
            <Copy className="w-2.5 h-2.5" />
          </Button>
          <Button
            variant="outline" size="sm"
            className={`h-6 px-1.5 ${usedByCount > 0
              ? "text-[#1a1a1a]/20 cursor-not-allowed"
              : "text-red-400 hover:text-red-500 hover:border-red-200"
            }`}
            onClick={() => usedByCount === 0 && onDelete(template)}
            title={usedByCount > 0 ? `${usedByCount}개 규칙에서 사용 중 — 먼저 규칙을 수정하세요` : "삭제"}
            disabled={usedByCount > 0}
          >
            <Trash2 className="w-2.5 h-2.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
