import { describe, expect, it } from "vitest"

// 운영 데스크(운영 도구 탭 개편)의 순수 로직 — 스탯 스트립 집계와 회귀 판정 메타.
// UI 마크업은 게이트(eslint·build)와 시각 확인으로 검증하고, 여기서는 데이터 계약을 고정한다.
import {
  REGRESSION_JUDGE_ACTIONS,
  regressionOutcomeChip,
  summarizeDocsGaps,
} from "@/components/admin/cs-chat/ops-desk"

describe("summarizeDocsGaps", () => {
  it("splits clusters by source and counts zero-result searches", () => {
    const summary = summarizeDocsGaps({
      gapClusters: [
        { metadata: { source: "chatbot_mvp_exact_match" } },
        { metadata: {} },
        {},
        { metadata: { source: "internal_cs_fallback" } },
        { metadata: { source: "internal_cs_fallback" } },
        { metadata: { source: "internal_cs_review" } },
      ],
      zeroResultSearches: [
        { query: "녹화", count: 3, lastSeenAt: "2026-07-16T00:00:00.000Z" },
        { query: "환불", count: 1, lastSeenAt: "2026-07-16T00:00:00.000Z" },
      ],
    })

    // source 미기록(레거시) 클러스터는 챗봇 유입으로 집계한다.
    expect(summary.chatbot).toBe(3)
    expect(summary.internalCsFallback).toBe(2)
    expect(summary.internalCsReview).toBe(1)
    expect(summary.internalCs).toBe(3)
    expect(summary.zeroResult).toBe(2)
    expect(summary.capped).toBe(false)
  })

  it("marks the summary as capped when the cluster list hits the fetch cap", () => {
    const summary = summarizeDocsGaps({
      gapClusters: Array.from({ length: 30 }, () => ({ metadata: { source: "chatbot_mvp_exact_match" } })),
      zeroResultSearches: [],
    })

    expect(summary.capped).toBe(true)
    expect(summary.chatbot).toBe(30)
  })

  it("tolerates missing arrays from a degraded response", () => {
    const summary = summarizeDocsGaps({})

    expect(summary).toEqual({
      chatbot: 0,
      internalCs: 0,
      internalCsFallback: 0,
      internalCsReview: 0,
      zeroResult: 0,
      capped: false,
    })
  })
})

describe("regression judge metadata", () => {
  it("keeps the four judgement actions with hover-only intent colors", () => {
    expect(REGRESSION_JUDGE_ACTIONS.map((action) => action.value)).toEqual([
      "pass",
      "needs_fix",
      "promoted",
      "excluded",
    ])
    for (const action of REGRESSION_JUDGE_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0)
      // DESIGN.md: 의미가 약한 곳은 중립으로 두고 hover에서만 의도색 — 기본 클래스에 상태색 배경 금지.
      expect(action.hoverClassName).toContain("hover:")
    }
  })

  it("maps judged outcomes to a result chip and leaves not_evaluated unmapped", () => {
    expect(regressionOutcomeChip("promoted")?.label).toBe("반영됨")
    expect(regressionOutcomeChip("pass")?.label).toBe("통과")
    expect(regressionOutcomeChip("needs_fix")?.label).toBe("수정 필요")
    expect(regressionOutcomeChip("excluded")?.label).toBe("제외")
    expect(regressionOutcomeChip("not_evaluated")).toBeNull()
  })
})
