// 장부 상단 상태 줄 통합(2026-09-14) — 동기화·정합 체크·CRM 연결 세 줄을 한 줄 요약으로.
// 세 신호가 각자 줄을 차지하던 것을 "무엇이 문제인가"만 앞에 세우는 하나의 판정으로 모은다.
// 시트 공유가 끊기면 정합 체크 실패는 같은 원인이라 별도 경보로 세우지 않는다.
import { describe, expect, it } from "vitest"

import { describeLedgerStatus } from "@/lib/branch/ledger-status-summary"

const HEALTHY_SYNC = { failedDays: 0, lastSuccessAt: "2026-09-14T00:00:00Z", permissionDenied: false, truncated: false }
const BROKEN_SYNC = { failedDays: 14, lastSuccessAt: "2026-08-18T02:30:52Z", permissionDenied: true, truncated: false }
const NOW = new Date("2026-09-14T03:00:00Z")

describe("describeLedgerStatus", () => {
  it("puts a broken sync first and folds the integrity failure into it", () => {
    const status = describeLedgerStatus({
      sync: BROKEN_SYNC,
      integrity: { state: "error" },
      crm: { state: "ready", health: "low", accountConnected: 2, accountTotal: 230, revenuePctLabel: "1.4%" },
      now: NOW,
    })
    expect(status.segments.map((s) => s.id)).toEqual(["sync", "integrity", "crm"])
    expect(status.segments[0]).toMatchObject({ tone: "danger", label: "동기화 14일째 실패 · 8/18 기준" })
    expect(status.segments[1]).toMatchObject({ tone: "neutral", label: "정합 체크 중단 — 시트 끊김" })
    expect(status.segments[2]).toMatchObject({ tone: "low", label: "CRM 연결 2/230 · 매출 1.4%" })
    expect(status.worst).toBe("danger")
  })

  it("shows integrity issues by severity when sync is healthy", () => {
    const status = describeLedgerStatus({
      sync: HEALTHY_SYNC,
      integrity: { state: "ready", warnCount: 2, errorCount: 1 },
      crm: { state: "ready", health: "healthy", accountConnected: 200, accountTotal: 230, revenuePctLabel: "91.0%" },
      now: NOW,
    })
    expect(status.segments[0]).toMatchObject({ tone: "ok", label: "동기화 정상" })
    expect(status.segments[1]).toMatchObject({ tone: "danger", label: "정합 이슈 3건" })
    expect(status.segments[2]).toMatchObject({ tone: "healthy" })
    expect(status.worst).toBe("danger")
  })

  it("keeps loading and unavailable states distinct from 'no issues'", () => {
    const status = describeLedgerStatus({
      sync: undefined,
      integrity: { state: "loading" },
      crm: { state: "unavailable" },
      now: NOW,
    })
    expect(status.segments[0]).toMatchObject({ tone: "neutral", label: "동기화 상태 확인 중" })
    expect(status.segments[1]).toMatchObject({ tone: "neutral", label: "정합 확인 중" })
    expect(status.segments[2]).toMatchObject({ tone: "neutral", label: "CRM 연결 확인 불가" })
    expect(status.worst).toBe("neutral")
  })

  it("treats a clean integrity check as ok and a non-permission check error as neutral 'check unavailable'", () => {
    const clean = describeLedgerStatus({ sync: HEALTHY_SYNC, integrity: { state: "ready", warnCount: 0, errorCount: 0 }, crm: { state: "empty" }, now: NOW })
    expect(clean.segments[1]).toMatchObject({ tone: "ok", label: "정합 이상 없음" })
    expect(clean.segments.map((s) => s.id)).toEqual(["sync", "integrity"]) // 매칭 대상이 없으면 CRM 칸 생략
    const unavailable = describeLedgerStatus({ sync: HEALTHY_SYNC, integrity: { state: "error" }, crm: { state: "empty" }, now: NOW })
    expect(unavailable.segments[1]).toMatchObject({ tone: "neutral", label: "정합 체크 불가" })
  })
})
