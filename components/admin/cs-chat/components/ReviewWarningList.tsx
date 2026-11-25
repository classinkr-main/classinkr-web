import { ShieldAlert } from "lucide-react"

import { cn } from "@/lib/utils"

/** lib/internal-cs-chat/answer-checks.ts 의 ReviewWarning 과 같은 모양. 순수 타입만 쓴다. */
export interface ReviewWarningItem {
  code: string
  severity: "high" | "medium"
  label: string
  excerpt: string
}

export interface ReviewWarningListProps {
  warnings?: readonly ReviewWarningItem[] | null
  className?: string
}

const SEVERITY_LABEL: Record<ReviewWarningItem["severity"], string> = {
  high: "꼭 확인",
  medium: "확인",
}

/**
 * 답 후검사(answer-checks)가 찾은 항목을 검토 화면에 그린다(IC-04). 경고가 없으면 아무것도 그리지 않는다.
 * 경고는 차단이 아니다 — 검토자가 확인하고 고치거나 그대로 쓸지 정한다. B4 가 검토 드로어에 장착한다.
 */
export default function ReviewWarningList({ warnings, className }: ReviewWarningListProps) {
  const items = warnings ?? []
  if (items.length === 0) return null
  return (
    <section
      aria-label="답 검사 경고"
      data-testid="review-warning-list"
      className={cn("rounded-md border border-[#EBD9A8] bg-[#FFF7E0] px-3 py-2 text-[12px] text-[#6B4E00]", className)}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        검토 경고 {items.length}건
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((warning, index) => (
          <li key={`${warning.code}-${index}`} data-code={warning.code}>
            <span className="mr-1.5 rounded border border-current px-1 text-[10px] font-semibold">
              {SEVERITY_LABEL[warning.severity]}
            </span>
            {warning.label}
            {warning.excerpt ? <span className="mt-0.5 block text-[11px] opacity-80">“{warning.excerpt}”</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
