// tests/marketing/ad-sync-candidates.test.ts
// 일자 스냅샷 → 자동 링크 후보 접기. 여기서 접는 방식이 플래너 판정(no-activity·unnamed·
// stale)을 그대로 결정하므로, "왜 안 붙었지"의 절반이 이 함수에서 갈린다.

import { describe, expect, it } from "vitest"

import {
  foldAdSyncCandidates,
  hasAdActivity,
  type AdDailySnapshotRow,
} from "@/lib/marketing/ad-sync-candidates"

function row(over: Partial<AdDailySnapshotRow> = {}): AdDailySnapshotRow {
  return {
    date: "2026-09-01",
    campaignId: "c1",
    campaignName: "9월 브랜드",
    spend: 10_000,
    impressions: 1_000,
    clicks: 20,
    currency: "KRW",
    ...over,
  }
}

describe("hasAdActivity", () => {
  it("노출·클릭·집행이 전부 0 인 행은 집행일이 아니다", () => {
    expect(hasAdActivity(row({ spend: 0, impressions: 0, clicks: 0 }))).toBe(false)
  })

  it("노출만 있고 과금이 없어도 집행일이다 — 광고는 돌았다", () => {
    expect(hasAdActivity(row({ spend: 0, impressions: 340, clicks: 0 }))).toBe(true)
  })
})

describe("foldAdSyncCandidates", () => {
  it("캠페인당 한 건으로 접고 집행 합·통화를 남긴다", () => {
    const out = foldAdSyncCandidates(
      [
        row({ date: "2026-09-01", spend: 10_000 }),
        row({ date: "2026-09-02", spend: 5_500 }),
      ],
      "naver",
    )
    expect(out).toEqual([
      {
        channel: "naver",
        campaignId: "c1",
        campaignName: "9월 브랜드",
        lastActiveDate: "2026-09-02",
        spend: 15_500,
        currency: "KRW",
      },
    ])
  })

  it("전부 0 인 행만 있으면 lastActiveDate 가 null — 플래너가 no-activity 로 보고한다", () => {
    const [candidate] = foldAdSyncCandidates(
      [row({ spend: 0, impressions: 0, clicks: 0 })],
      "google",
    )
    expect(candidate.lastActiveDate).toBeNull()
    // 집행이 없어도 캠페인 자체는 후보로 남긴다 — 무음으로 사라지면 이유를 못 읽는다.
    expect(candidate.campaignId).toBe("c1")
  })

  it("마지막 집행일은 0 행을 건너뛴다 — 정지한 캠페인이 '어제 돌았다'가 되면 안 된다", () => {
    const [candidate] = foldAdSyncCandidates(
      [
        row({ date: "2026-07-01" }),
        row({ date: "2026-09-10", spend: 0, impressions: 0, clicks: 0 }),
      ],
      "google",
    )
    expect(candidate.lastActiveDate).toBe("2026-07-01")
  })

  it("최신 행의 이름이 비어도 아는 이름을 지우지 않는다", () => {
    const [candidate] = foldAdSyncCandidates(
      [
        row({ date: "2026-09-01", campaignName: "9월 브랜드" }),
        row({ date: "2026-09-02", campaignName: null }),
        row({ date: "2026-09-03", campaignName: "   " }),
      ],
      "google",
    )
    expect(candidate.campaignName).toBe("9월 브랜드")
  })

  it("이름이 한 번도 없으면 null — ID 로 이름을 지어내지 않는다", () => {
    const [candidate] = foldAdSyncCandidates([row({ campaignName: null })], "google")
    expect(candidate.campaignName).toBeNull()
  })

  it("통화가 섞이면 합계를 내지 않는다 — 더할 수 없다는 사실이 null 이다", () => {
    const [candidate] = foldAdSyncCandidates(
      [
        row({ date: "2026-09-01", currency: "KRW", spend: 10_000 }),
        row({ date: "2026-09-02", currency: "USD", spend: 12 }),
      ],
      "google",
    )
    expect(candidate.spend).toBeNull()
    expect(candidate.currency).toBeNull()
    // 통화를 몰라도 마지막 집행일은 안다 — 링크 판정은 그대로 돌아간다.
    expect(candidate.lastActiveDate).toBe("2026-09-02")
  })

  it("통화 컬럼이 비면 금액을 말하지 않는다 — 단위 없는 숫자는 숫자가 아니다", () => {
    const [candidate] = foldAdSyncCandidates([row({ currency: null })], "google")
    expect(candidate.spend).toBeNull()
    expect(candidate.currency).toBeNull()
  })

  it("campaignId 는 스냅샷 값 그대로 — 다듬으면 링크는 생겨도 집행이 안 잡힌다", () => {
    const [candidate] = foldAdSyncCandidates([row({ campaignId: " 21345678 " })], "google")
    expect(candidate.campaignId).toBe(" 21345678 ")
  })

  it("행 순서가 뒤섞여도 결과가 같다 — 조회 규약이 흔들려도 판정이 안 바뀐다", () => {
    const rows = [
      row({ date: "2026-09-03", campaignName: null, spend: 0, impressions: 0, clicks: 0 }),
      row({ date: "2026-09-01", campaignName: "구 이름", spend: 1_000 }),
      row({ date: "2026-09-02", campaignName: "새 이름", spend: 2_000 }),
    ]
    const [asc] = foldAdSyncCandidates([...rows].sort((a, b) => a.date.localeCompare(b.date)), "naver")
    const [shuffled] = foldAdSyncCandidates(rows, "naver")
    expect(shuffled).toEqual(asc)
    expect(shuffled.campaignName).toBe("새 이름")
    expect(shuffled.lastActiveDate).toBe("2026-09-02")
  })

  it("빈 입력은 빈 배열", () => {
    expect(foldAdSyncCandidates([], "naver")).toEqual([])
  })
})
