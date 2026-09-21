// A4 — 기록 목록의 날짜 그룹 섹션(스티키 헤더 + 건수). 그룹핑 자체는
// lib/crm/activity-date-groups.ts(groupEventsByKstDay)가 순수 함수로 계산하고, 이 컴포넌트는
// 그 결과를 그리기만 한다 — 행 마크업은 호출부가 renderRow로 넘긴다(CrmActivityClient의 기존
// CrmEventRow 구성을 그대로 재사용하기 위함).

import type { ActivityDateGroup } from "@/lib/crm/activity-date-groups"

export default function ActivityDateGroups<T>({
  groups,
  renderRow,
  className,
}: {
  groups: ActivityDateGroup<T>[]
  renderRow: (row: T) => React.ReactNode
  className?: string
}) {
  if (groups.length === 0) return null

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {groups.map((group) => (
        <section key={group.dayKey} aria-labelledby={`activity-day-${group.dayKey}`} className="space-y-1.5">
          <div
            id={`activity-day-${group.dayKey}`}
            className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-2 bg-[#FAFAF8] px-1 py-1.5"
          >
            <h3 className="text-[12px] font-bold text-[#111110]">{group.label}</h3>
            <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">
              {group.rows.length.toLocaleString("ko-KR")}건
            </span>
          </div>
          <div className="space-y-1.5">{group.rows.map((row) => renderRow(row))}</div>
        </section>
      ))}
    </div>
  )
}
