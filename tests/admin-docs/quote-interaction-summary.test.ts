import { describe, expect, it } from "vitest"

import {
  PUBLIC_QUOTE_ACCEPT_ACTION,
  PUBLIC_QUOTE_REVIEW_ACTION,
  PUBLIC_QUOTE_VIEW_ACTION,
  summarizeQuoteInteractionLogs,
} from "@/lib/portal/repositories/activity"
import type { ActivityLog } from "@/lib/portal/types"

// 한 견적 문서에 공유 링크가 여러 개(레거시 view + 신규 sign)일 때, 상호작용
// 로그가 share_id별로 흩어진다. 어드민 목록은 "최신 공유"만 집계하면 이전
// 링크에 쌓인 열람·검토·수락을 놓친다(P0-1 언더카운트 버그).

const DOC_ID = "doc-1"
const VERSION_ID = "ver-1"

// 오래된 view 공유(A): 열람 5회 + 검토 확인
const SHARE_A = "share-a"
const TOKEN_A = "token-a"
// 최신 sign 공유(B): 열람 2회 + 수락
const SHARE_B = "share-b"
const TOKEN_B = "token-b"

function log(
  action_type: string,
  shareId: string,
  token: string,
  createdAt: string
): ActivityLog {
  return {
    id: `${action_type}-${shareId}-${createdAt}`,
    partner_account_id: "pa-1",
    customer_id: "cust-1",
    deal_id: "deal-1",
    actor_user_id: null,
    actor_role: "public",
    action_type,
    target_type: "quote_document",
    target_id: DOC_ID,
    summary: "",
    before_json: null,
    after_json: { version_id: VERSION_ID, share_id: shareId, token },
    created_at: createdAt,
  }
}

const LOGS: ActivityLog[] = [
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_A, TOKEN_A, "2026-07-10T01:00:00Z"),
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_A, TOKEN_A, "2026-07-10T02:00:00Z"),
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_A, TOKEN_A, "2026-07-10T03:00:00Z"),
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_A, TOKEN_A, "2026-07-10T04:00:00Z"),
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_A, TOKEN_A, "2026-07-10T05:00:00Z"),
  log(PUBLIC_QUOTE_REVIEW_ACTION, SHARE_A, TOKEN_A, "2026-07-10T06:00:00Z"),
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_B, TOKEN_B, "2026-07-15T01:00:00Z"),
  log(PUBLIC_QUOTE_VIEW_ACTION, SHARE_B, TOKEN_B, "2026-07-15T02:00:00Z"),
  log(PUBLIC_QUOTE_ACCEPT_ACTION, SHARE_B, TOKEN_B, "2026-07-15T03:00:00Z"),
]

describe("summarizeQuoteInteractionLogs — multi-share aggregation (P0-1)", () => {
  it("최신 공유(B)만 필터하면 이전 공유(A)의 열람·검토를 놓친다 (버그 재현)", () => {
    const latestOnly = summarizeQuoteInteractionLogs(LOGS, {
      version_id: VERSION_ID,
      share_id: SHARE_B,
      token: TOKEN_B,
    })
    expect(latestOnly.viewCount).toBe(2) // 실제 7회인데 2회로 언더카운트
    expect(latestOnly.reviewConfirmedAt).toBeNull() // 검토가 사라짐
    expect(latestOnly.acceptedAt).not.toBeNull()
  })

  it("문서 전체 집계(필터 없음)는 모든 공유의 상호작용을 합산한다 (수정본)", () => {
    const aggregate = summarizeQuoteInteractionLogs(LOGS, {
      version_id: null,
      share_id: null,
      token: null,
    })
    expect(aggregate.viewCount).toBe(7)
    expect(aggregate.firstViewedAt).toBe("2026-07-10T01:00:00Z")
    expect(aggregate.lastViewedAt).toBe("2026-07-15T02:00:00Z")
    expect(aggregate.reviewConfirmedAt).not.toBeNull()
    expect(aggregate.acceptedAt).not.toBeNull()
  })
})
