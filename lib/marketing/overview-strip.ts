// lib/marketing/overview-strip.ts
// Overview 마케팅 성과 축약 스트립(components/admin/overview/MarketingPerfStrip.tsx)의 순수 파생.
//
// 이 저장소의 vitest 는 node 환경이라 DOM 렌더 테스트가 없다 — 그래서 "무엇을 어떤 톤으로
// 말할지"를 판정하는 조각만 표시 컴포넌트에서 여기로 내려 테스트 대상으로 만든다
// (tests/campaigns/overview-strip.test.ts). 색·클래스 같은 표시 결정은 여기 두지 않는다.
//
// 순수 모듈 유지 — 서버 전용 import 금지(lib/marketing/perf.ts 와 같은 규약).

import { ANOMALY_KIND_LABEL, type AnomalyKind } from "@/lib/marketing/anomaly"

/* ─── 이상 신호 요약 ──────────────────────────────────────────── */

// 종류별 건수가 같을 때의 결정적 정렬 축 — 감지 규칙(anomaly.ts)의 선언 순서를 그대로 쓴다.
// 모르는 종류는 이 목록 밖이라 항상 뒤로 밀린다(라벨도 지어내지 않고 원문 그대로 쓴다).
const KIND_ORDER: readonly string[] = Object.keys(ANOMALY_KIND_LABEL)

export interface OverviewAnomalySummary {
  /** 감지 건수 합(캠페인 × 종류). 0 이면 스트립은 이상 신호 줄 자체를 렌더하지 않는다. */
  total: number
  /** 배지 문구 — "CPL 급등 2". 종류가 maxKinds 를 넘으면 마지막에 "외 N종". */
  badges: string[]
}

function anomalyLabel(kind: string): string {
  return ANOMALY_KIND_LABEL[kind as AnomalyKind] ?? kind
}

function orderIndex(kind: string): number {
  const index = KIND_ORDER.indexOf(kind)
  return index < 0 ? KIND_ORDER.length : index
}

/**
 * perf 응답의 스코어보드 행에 붙은 이상 종류(계약상 문자열 배열 = AnomalyKind)를 종류별로 접는다.
 *
 * 입력을 `{ anomalies }` 최소 형태로 받는 이유: 이 요약은 PerfScoreboardRow 의 나머지 필드와
 * 무관하고, 그래야 테스트가 행 전체를 지어내지 않아도 된다.
 *
 * 표기 규약 — 캠페인 허브(SummaryTab.anomalyBadges)는 1건이면 개수를 생략하지만 여기서는
 * 1건도 "CPL 급등 1" 로 개수를 붙인다. 허브는 배지 바로 아래 스코어보드가 어떤 캠페인인지
 * 열거하지만 Overview 축약본에는 그 목록이 없어, 이 한 줄이 규모를 말하는 유일한 자리이기
 * 때문이다(라벨 SSOT 는 양쪽 모두 ANOMALY_KIND_LABEL 하나).
 */
export function summarizeScoreboardAnomalies(
  rows: ReadonlyArray<{ anomalies: readonly string[] }>,
  { maxKinds = 2 }: { maxKinds?: number } = {}
): OverviewAnomalySummary {
  const counts = new Map<string, number>()
  let total = 0
  for (const row of rows) {
    for (const kind of row.anomalies) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
      total += 1
    }
  }
  if (total === 0) return { total: 0, badges: [] }

  // 많이 걸린 종류가 대표 — 동률은 감지 규칙 선언 순서, 그래도 같으면 kind 문자열로 고정한다
  // (Map 순회 순서에 표시가 흔들리지 않게).
  const ranked = [...counts].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1]
    const gap = orderIndex(a[0]) - orderIndex(b[0])
    return gap !== 0 ? gap : a[0].localeCompare(b[0])
  })

  const shown = ranked.slice(0, Math.max(1, maxKinds))
  const badges = shown.map(([kind, count]) => `${anomalyLabel(kind)} ${count}`)
  const hiddenKinds = ranked.length - shown.length
  if (hiddenKinds > 0) badges.push(`외 ${hiddenKinds}종`)
  return { total, badges }
}

/* ─── 델타 톤 ────────────────────────────────────────────────── */

/** 지표 방향 — 델타 색이 "좋아짐/나빠짐"을 말한다. 광고비처럼 방향 가치판단이 없는 축은 "none". */
export type DeltaValence = "up-good" | "down-good" | "none"

/** 표시층이 클래스로 옮길 판정 결과. unknown = 비교 불가(이전 기간 미측정·분모 0). */
export type DeltaTone = "good" | "bad" | "neutral" | "unknown"

/**
 * 전기 대비 증감률 → 톤. 캠페인 허브 KpiStrip 의 DeltaHint 와 같은 판정이다
 * (광고비=중립, 리드·전환율=증가 좋음, CPL=감소 좋음).
 *
 * null 을 0 으로 뭉개지 않는다 — "변화 없음(neutral)"과 "비교 불가(unknown)"는 다른 사실이고,
 * 표시층은 후자를 "이전 기간 대비 —" 로 적는다.
 */
export function resolveDeltaTone(
  deltaPct: number | null | undefined,
  valence: DeltaValence
): DeltaTone {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return "unknown"
  if (deltaPct === 0 || valence === "none") return "neutral"
  const improved = valence === "up-good" ? deltaPct > 0 : deltaPct < 0
  return improved ? "good" : "bad"
}
