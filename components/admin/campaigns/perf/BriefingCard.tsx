"use client"

// 판정 밴드 — 한눈에 층의 첫 줄. 헤드라인 1문장 + 상태 점 + 배지 + 번호 액션(최대 3).
//
// 2026-09-14 재구성 전에는 우측 384px 레일 두 번째 자리의 "브리핑 카드"였다. 판정은 화면의
// 주어라 맨 위 전폭으로 올리고, 액션은 오른쪽 열에 가로로 눕혔다(기획 §3.3-1).
//
// props 는 중립 형태({headline, items, actions, badges})로 고정한다 — 콘텐츠가 규칙 기반
// 생성기(SummaryTab buildBriefing)에서 오든 AI payload 에서 오든 이 표시 컴포넌트는 하나다.
//
// 출처 표기(meta)는 선택이 아니라 신뢰 장치다: AI 가 쓴 문장인지 규칙이 만든 문장인지,
// 언제 만든 것인지 화면에서 구분되지 않으면 지난주 브리핑을 오늘의 판단으로 읽게 된다.
// 텍스트 길이는 AI 출력이라 통제 불가 — 모든 문단에 break-words 로 넘침을 막는다.
//
// 상태 점 색은 DESIGN.md 신호 축(정상=그린 · 주의=앰버 · 경고=테라코타 · 미측정=뉴트럴)이며
// 규칙은 lib/marketing/verdict.ts 가 정한다 — 여기서 숫자를 다시 판정하지 않는다.

import type { VerdictStatus } from "@/lib/marketing/verdict"

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
  /** 출처·시각 한 줄 — 예) "AI 브리핑 · 08/20 07:30 생성". 규칙 기반이면 배지로만 표기하고 생략. */
  meta?: string | null
  /** 강등 사실(재생성 실패 등) — 있으면 danger 아웃라인 한 줄로 밝힌다(무음 강등 금지). */
  note?: string | null
  /** "다시 생성" — 없으면 버튼 자체를 숨긴다. */
  onRegenerate?: () => void
  regenerating?: boolean
  /** 상태 점 — 생략하면 점 없이 배지만(구 카드 호환). */
  status?: VerdictStatus
  /** 상태 점 옆 문장 — "주의 · 이상 신호 2건". */
  statusLine?: string
  /** 스냅샷 시각 등 데이터 신선도 한 줄 — 헤드라인의 근거가 언제 것인지. */
  snapshotLine?: string | null
}

const STATUS_DOT: Record<VerdictStatus, { dot: string; ring: string; text: string }> = {
  ok: { dot: "bg-[#084734]", ring: "ring-[#ECFDF5]", text: "text-[#084734]" },
  caution: { dot: "bg-[#A8741A]", ring: "ring-[#FBF1E0]", text: "text-[#A8741A]" },
  warning: { dot: "bg-[#B85C33]", ring: "ring-[#FEF3EE]", text: "text-[#B85C33]" },
  unmeasured: { dot: "bg-[#A39E98]", ring: "ring-[#F0F0EC]", text: "text-[#615D59]" },
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
  status,
  statusLine,
  snapshotLine,
}: BriefingCardProps) {
  // AI 브리핑인지 규칙 기반 폴백인지 — 이 컴포넌트가 가진 신호는 meta 하나다.
  // 승격(그린 아웃라인 + 그림자 1단)은 AI 일 때만 — 폴백까지 같은 무게로 올리면 화면이
  // "AI 가 판단했다"고 거짓말하게 된다. 헤드라인 크기는 둘 다 같다: 판정 문장은 출처와
  // 무관하게 이 화면의 주어다.
  const aiSourced = typeof meta === "string" && meta.trim() !== ""
  const dot = status ? STATUS_DOT[status] : null
  const visibleActions = actions.slice(0, 3)

  return (
    <section
      aria-label="퍼포먼스 판정"
      aria-busy={regenerating}
      className={`grid grid-cols-1 gap-4 rounded-2xl border bg-white p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] lg:gap-8 ${
        aiSourced
          ? "border-[#BDEFD8] shadow-[0_1px_3px_rgba(8,71,52,0.06)]"
          : "border-[#e8e8e4]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {dot && (
            <span className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${dot.text}`}>
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ring-[3px] ${dot.dot} ${dot.ring}`} />
              {statusLine}
            </span>
          )}
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/45"
            >
              {badge}
            </span>
          ))}
        </div>

        {note && (
          <p
            role="status"
            className="mt-2 break-words rounded-md border border-[#F6D5C5] px-2 py-1 text-[11px] leading-relaxed text-[#B85C33]"
          >
            {note}
          </p>
        )}

        {/* 헤드라인 22px — 화면의 주어. 굵기 600, 자간 -0.012em(DESIGN §3 헤딩 압축 규칙). */}
        <p className="mt-3 break-words text-[22px] font-semibold leading-[1.3] tracking-[-0.012em] text-[#111110] [text-wrap:balance]">
          {headline}
        </p>

        {items.length > 0 && (
          <ul className="mt-3 space-y-1">
            {items.map((item, index) => (
              <li key={index} className="flex gap-2 text-[12px] leading-relaxed text-[#1a1a1a]/60">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#A39E98]" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[#1a1a1a]/45">
          {meta ? <span className="break-words">{meta}</span> : <span>규칙 기반 요약</span>}
          {snapshotLine && <span>{snapshotLine}</span>}
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

      {visibleActions.length > 0 && (
        <ol
          aria-label="추천 액션"
          className="flex flex-col gap-2.5 border-t border-[#f0f0ec] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
        >
          {visibleActions.map((action, index) => (
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
