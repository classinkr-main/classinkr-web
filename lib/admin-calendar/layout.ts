/**
 * layout.ts — 멀티데이 일정의 가로 막대 배치
 *
 * 담당자 스윔레인과 소스 타임라인은 한 행 안에서 여러 일정이 날짜를 두고 겹친다.
 * 겹치는 막대를 같은 줄에 그리면 서로를 덮으므로, 겹치지 않는 것끼리 같은 줄(lane)에
 * 몰아넣고 겹치는 것만 아래 줄로 밀어낸다 — 구간 그래프 채색의 탐욕 해법이다.
 *
 * 좌표는 날짜 문자열이 아니라 "기간 시작으로부터 몇 칸" 인덱스로 돌려준다.
 * 그리드가 grid-column: span N 으로 바로 그릴 수 있고, 순수 함수라 테스트가 쉽다.
 */
import { daysBetween, enumerateDates, type CalendarRange } from "./range"

export interface LaneSpan<T> {
  item: T
  /** 기간 시작으로부터의 0-기반 칸 인덱스(포함) */
  startIndex: number
  /** 포함. 하루짜리는 startIndex 와 같다 */
  endIndex: number
  /** 0-기반 줄 번호 */
  lane: number
  /** 일정이 기간 앞/뒤로 잘렸는지 — 화살표 같은 잘림 표시에 쓴다 */
  clippedStart: boolean
  clippedEnd: boolean
}

export interface DatedItem {
  date: string
  endDate?: string
}

/**
 * 멀티데이 일정이 걸치는 날짜를 전부 펼친다 — 날짜 → 일정 맵을 만들 때 쓴다.
 * 손상된 범위(종료 < 시작)는 시작일 하루로만 취급한다.
 */
export function enumerateEventDates(event: DatedItem): string[] {
  const dates = enumerateDates(event.date, event.endDate ?? event.date)
  return dates.length > 0 ? dates : [event.date]
}

/** 날짜 문자열 → 그 날 걸치는 일정 목록. */
export function buildEventsByDate<T extends DatedItem>(items: readonly T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const item of items) {
    for (const date of enumerateEventDates(item)) {
      if (!map[date]) map[date] = []
      map[date].push(item)
    }
  }
  return map
}

/**
 * 기간과 겹치는 항목만 남겨 lane 을 배정한다.
 *
 * 정렬 기준: 시작이 이른 것 먼저, 같으면 긴 것 먼저. 긴 막대를 위로 올려야
 * 짧은 막대들이 그 아래에서 촘촘히 채워지고 빈 줄이 덜 생긴다.
 */
export function assignLanes<T extends DatedItem>(
  items: readonly T[],
  range: CalendarRange
): LaneSpan<T>[] {
  const totalDays = daysBetween(range.from, range.to)
  if (totalDays < 0) return []

  const spans = items
    .filter((item) => item.date <= range.to && (item.endDate ?? item.date) >= range.from)
    .map((item) => {
      const rawStart = daysBetween(range.from, item.date)
      const rawEnd = daysBetween(range.from, item.endDate ?? item.date)
      return {
        item,
        rawStart,
        rawEnd,
        startIndex: Math.max(0, rawStart),
        endIndex: Math.min(totalDays, rawEnd),
      }
    })
    // 종료가 시작보다 앞선 손상된 데이터는 하루짜리로 눕힌다(버리지 않는다).
    .map((span) => ({ ...span, endIndex: Math.max(span.startIndex, span.endIndex) }))
    .sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex)

  // laneEnds[i] = i번 줄에 마지막으로 놓인 막대의 endIndex
  const laneEnds: number[] = []

  return spans.map((span) => {
    let lane = laneEnds.findIndex((end) => end < span.startIndex)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(span.endIndex)
    } else {
      laneEnds[lane] = span.endIndex
    }

    return {
      item: span.item,
      startIndex: span.startIndex,
      endIndex: span.endIndex,
      lane,
      clippedStart: span.rawStart < 0,
      clippedEnd: span.rawEnd > totalDays,
    }
  })
}

/** 배치 결과가 차지하는 줄 수. 행 높이 계산에 쓴다. */
export function countLanes<T>(spans: readonly LaneSpan<T>[]): number {
  return spans.reduce((max, span) => Math.max(max, span.lane + 1), 0)
}

export interface LaneLayout<T> {
  spans: LaneSpan<T>[]
  /** 상한을 넘겨 그리지 못한 항목. 화면에는 "+N개"로만 알린다. */
  overflow: T[]
  lanes: number
}

/**
 * 줄 수에 상한을 두고 배치한다.
 *
 * 하루짜리 일정이 수십 건 쌓이면(예: 마케팅 캘린더 한 달치) 겹치지 않아도 줄이 계속 늘어
 * 행 하나가 화면을 통째로 먹는다. 그때는 막대 하나하나가 어차피 읽히지 않으므로
 * 위쪽 몇 줄만 그리고 나머지는 개수로 알린다 — 잘랐다는 사실은 반드시 표시한다.
 */
export function layoutLanes<T extends DatedItem>(
  items: readonly T[],
  range: CalendarRange,
  maxLanes: number
): LaneLayout<T> {
  const all = assignLanes(items, range)
  const spans = all.filter((span) => span.lane < maxLanes)
  return {
    spans,
    overflow: all.filter((span) => span.lane >= maxLanes).map((span) => span.item),
    lanes: Math.max(1, countLanes(spans)),
  }
}

/**
 * 항목을 담당자별로 묶는다. 담당자가 여럿이면 각 담당자 행에 모두 나타난다 —
 * 한 명에게만 붙이면 "내 행에 안 보인다"는 누락이 생긴다.
 * 담당자가 없는 항목은 unassignedKey 행으로 모은다.
 */
export function groupByAssignee<T extends { assignees?: string[] }>(
  items: readonly T[],
  unassignedKey = "미지정"
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const names = item.assignees?.length ? item.assignees : [unassignedKey]
    for (const name of names) {
      const bucket = groups.get(name)
      if (bucket) bucket.push(item)
      else groups.set(name, [item])
    }
  }
  return groups
}
