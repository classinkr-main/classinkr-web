"use client"

// 브리핑 카드 — 헤드라인 1문장 + 인사이트 항목 + 번호 액션(최대 3) + 배지.
// props 는 중립 형태({headline, items, actions, badges})로 고정한다 — Phase 3 에서
// 규칙 기반 생성기가 AI payload 로 교체되어도 이 표시 컴포넌트는 그대로 쓴다.
// 콘텐츠 생성 규칙(buildBriefing)은 SummaryTab 쪽에 있다(여기는 렌더만).

export interface BriefingAction {
  title: string
  why?: string
}

export interface BriefingContent {
  headline: string
  items: string[]
  actions: BriefingAction[]
  badges: string[]
}

export function BriefingCard({ headline, items, actions, badges }: BriefingContent) {
  return (
    // 그린 "아웃라인" 카드 — 채움 없이 보더로만 강조(파스텔 채움 지양 원칙).
    <section
      aria-label="퍼포먼스 브리핑"
      className="rounded-2xl border border-[#BDEFD8] bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
          브리핑
        </p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/45"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#111110]">
        {headline}
      </p>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex gap-2 text-[12px] leading-relaxed text-[#1a1a1a]/60"
            >
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#A39E98]" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      )}

      {actions.length > 0 && (
        <ol className="mt-4 space-y-2 border-t border-[#f0f0ec] pt-3">
          {actions.slice(0, 3).map((action, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#BDEFD8] text-[11px] font-bold tabular-nums text-[#084734]">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold leading-snug text-[#111110]">
                  {action.title}
                </p>
                {action.why && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#1a1a1a]/45">
                    {action.why}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
