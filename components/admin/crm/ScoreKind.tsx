/**
 * CRM 점수 3종의 이름·정의 SSOT (2026-09-17 우선순위 T3).
 *
 * 화면에 "82" 같은 숫자만 두면 건강도인지 리드 점수인지 우선순위 심각도인지 알 수 없다.
 * 숫자 옆에는 항상 이 파일의 라벨을 붙이고, 정의표(ScoreKindTable)를 인사이트 화면에 상시 둔다.
 * 산식 자체는 각 모듈이 정본이다 — 여기서는 이름과 한 줄 설명만 관리한다.
 *  - health:   lib/crm/customer-health.ts (computeCustomerHealth, 100 감점식, 75/55 밴드)
 *  - lead:     lib/crm/lead-ranking.ts (가치·응답·최근성·빈도·긴급 가중 상대값)
 *  - priority: lib/crm/priority.ts (today/renewal/stale_recovery/watch 버킷 + 85/68/42 심각도)
 */

export type ScoreKindId = "health" | "lead" | "priority"

export interface ScoreKindDefinition {
  id: ScoreKindId
  label: string
  subject: string
  range: string
  summary: string
  usedIn: string
}

export const SCORE_KINDS: readonly ScoreKindDefinition[] = [
  {
    id: "health",
    label: "건강도",
    subject: "기존 고객",
    range: "0–100",
    summary: "100에서 위험 신호·서비스 상태·만료 임박·미접촉 일수를 감점 · 75 이상 안전, 55 이상 주의, 그 아래 위험",
    usedIn: "고객 360 · 세그먼트 분포",
  },
  {
    id: "lead",
    label: "리드 점수",
    subject: "리드",
    range: "상대값",
    summary: "가치 32 · 응답 20 · 최근성 22 · 빈도 16 · 긴급 10 가중 합 · 비활성 ×0.35 · 금액이 아니다",
    usedIn: "리드 보드 정렬",
  },
  {
    id: "priority",
    label: "우선순위",
    subject: "리드 + 고객",
    range: "버킷 · 심각도",
    summary: "오늘/재계약/재활성/주시 버킷으로 나눈 뒤 85·68·42 경계로 심각도 표시 · 홈 큐의 순서",
    usedIn: "홈 오늘 할 일",
  },
] as const

export function scoreKind(id: ScoreKindId): ScoreKindDefinition {
  return SCORE_KINDS.find((k) => k.id === id) ?? SCORE_KINDS[0]
}

/**
 * 숫자 옆에 붙이는 작은 라벨. `value` 를 주면 "건강도 82" 처럼 값까지 한 덩어리로 그린다.
 * title 로 한 줄 정의를 보여 준다(hover·SR).
 */
export function ScoreKindLabel({
  kind,
  value,
  className,
}: {
  kind: ScoreKindId
  value?: number | string | null
  className?: string
}) {
  const def = scoreKind(kind)
  return (
    <span
      className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className ?? ""}`}
      title={`${def.label} (${def.subject} · ${def.range}) — ${def.summary}`}
      data-score-kind={kind}
    >
      <span className="text-[10.5px] font-semibold text-[#615D59]">{def.label}</span>
      {value !== undefined && value !== null ? (
        <span className="font-semibold tabular-nums text-[#111110]">{value}</span>
      ) : null}
    </span>
  )
}

/** 인사이트 등에 상시 두는 정의표. 데이터 없이 SCORE_KINDS 만 그린다. */
export function ScoreKindTable({ className }: { className?: string }) {
  return (
    <table className={`w-full border-collapse text-[11.5px] ${className ?? ""}`}>
      <caption className="sr-only">CRM 점수 3종 정의</caption>
      <thead>
        <tr>
          {["점수", "대상 · 범위", "무엇을 말하나", "쓰는 곳"].map((h) => (
            <th
              key={h}
              scope="col"
              className="border-b border-[#E8E8E4] px-2 py-1.5 text-left font-semibold text-[#615D59]"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SCORE_KINDS.map((k) => (
          <tr key={k.id} data-score-kind={k.id}>
            <th scope="row" className="border-b border-[#F0F0EC] px-2 py-1.5 text-left font-bold text-[#111110]">
              {k.label}
            </th>
            <td className="border-b border-[#F0F0EC] px-2 py-1.5 text-[#31302E]">
              {k.subject} · {k.range}
            </td>
            <td className="border-b border-[#F0F0EC] px-2 py-1.5 text-[#31302E]">{k.summary}</td>
            <td className="border-b border-[#F0F0EC] px-2 py-1.5 text-[#615D59]">{k.usedIn}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
