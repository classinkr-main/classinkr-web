"use client"

// 브리핑 카드 — 헤드라인 1문장 + 인사이트 항목 + 번호 액션(최대 3) + 배지.
// props 는 중립 형태({headline, items, actions, badges})로 고정한다 — 콘텐츠가 규칙 기반
// 생성기(SummaryTab buildBriefing)에서 오든 AI payload 에서 오든 이 표시 컴포넌트는 하나다.
//
// 출처 표기(meta)는 선택이 아니라 신뢰 장치다: AI 가 쓴 문장인지 규칙이 만든 문장인지,
// 언제 만든 것인지 화면에서 구분되지 않으면 지난주 브리핑을 오늘의 판단으로 읽게 된다.
// 텍스트 길이는 AI 출력이라 통제 불가 — 모든 문단에 break-words 로 넘침을 막는다.
//
// 시각 위계: 이 카드는 요약 탭에서 "먼저 읽을 것"이라 그린 아웃라인 + 옅은 그림자 1단으로
// 한 단 올린다. 단 승격은 AI 브리핑일 때만이다 — 규칙 기반 폴백까지 같은 무게로 올리면
// 화면이 "AI 가 판단했다"고 거짓말하게 된다(폴백은 지금 톤 그대로 둔다).

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

export interface BriefingCardProps extends BriefingContent {
  /** 출처·시각 한 줄 — 예) "AI 브리핑 · 08/20 07:30". 규칙 기반이면 배지로만 표기하고 생략. */
  meta?: string | null
  /** 강등 사실(재생성 실패 등) — 있으면 danger 아웃라인 한 줄로 밝힌다(무음 강등 금지). */
  note?: string | null
  /** "다시 생성" — 없으면 버튼 자체를 숨긴다. */
  onRegenerate?: () => void
  regenerating?: boolean
}

export function BriefingCard({
  headline,
  items,
  actions,
  badges,
  meta,
  note,
  onRegenerate,
  regenerating = false,
}: BriefingCardProps) {
  // AI 브리핑인지 규칙 기반 폴백인지 — 이 컴포넌트가 가진 신호는 meta 하나다.
  // SummaryTab composeBriefing 이 AI insight 가 있을 때만 "AI 브리핑 · 08/20 07:30 생성"을
  // 채우고, 폴백은 meta:null 로 내려보낸다. 승격 여부를 이 한 신호에만 걸어 두면
  // 새 prop 없이도 두 경로가 절대 같은 무게로 보이지 않는다.
  const aiSourced = typeof meta === "string" && meta.trim() !== ""
  return (
    // 그린 "아웃라인" 카드 — 채움 없이 보더로만 강조(파스텔 채움 지양 원칙).
    // 승격은 그림자 1단뿐 — 그린 채움이나 보더 강화를 더하면 위계가 아니라 소음이 된다.
    <section
      aria-label="퍼포먼스 브리핑"
      aria-busy={regenerating}
      className={`rounded-2xl border border-[#BDEFD8] bg-white p-4 sm:p-5${
        aiSourced ? " shadow-[0_1px_3px_rgba(8,71,52,0.06)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
            브리핑
          </p>
          {meta && (
            <p className="mt-1 break-words text-[10.5px] tabular-nums text-[#1a1a1a]/40">{meta}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/45"
            >
              {badge}
            </span>
          ))}
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              // 재생성은 Gemini 왕복이라 수십 초 걸린다 — 실행 중엔 눌리지 않게 잠근다.
              disabled={regenerating}
              className="rounded-full border border-[#BDEFD8] px-2.5 py-0.5 text-[10px] font-semibold text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenerating ? "생성 중…" : "다시 생성"}
            </button>
          )}
        </div>
      </div>

      {note && (
        <p
          role="status"
          className="mt-2 break-words rounded-md border border-[#F6D5C5] px-2 py-1 text-[11px] leading-relaxed text-[#B85C33]"
        >
          {note}
        </p>
      )}

      {/* 헤드라인 — AI 일 때만 크기를 한 단(15→16px) 키운다. 굵기·자간은 손대지 않는다:
          크기·굵기·자간을 한꺼번에 올리면 카드 하나가 페이지의 제목처럼 읽힌다.
          AI 문장은 길이를 통제할 수 없으니 break-words 는 크기와 무관하게 유지. */}
      <p
        className={`mt-2 break-words font-semibold leading-snug tracking-[-0.01em] text-[#111110] ${
          aiSourced ? "text-[16px]" : "text-[15px]"
        }`}
      >
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
              <span className="min-w-0 break-words">{item}</span>
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
                <p className="break-words text-[12.5px] font-semibold leading-snug text-[#111110]">
                  {action.title}
                </p>
                {action.why && (
                  <p className="mt-0.5 break-words text-[11px] leading-relaxed text-[#1a1a1a]/45">
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
