// 라운드 5 R-5·D-8(갱신 중 직전 값 유지)·R-9·Q-14·Q-15(토스트 역할·층위·오류 유지·큐 열기) 회귀 고정.
import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { RefreshingBadge } from "@/components/admin/branch/ledger/workbench-shared"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("useBranchJson keepPreviousData(R-5·D-8)", () => {
  const client = read("components/admin/branch/client-api.ts")

  it("새 키를 불러오는 동안 직전 data를 previous=true·loading=true로 돌려준다(opt-in)", () => {
    const hook = sliceBetween(client, "export function useBranchJson<T>", "export type BranchSyncResponseBody")
    const keyGuard = hook.indexOf("if (state.key !== stateKey) {")
    const keep = hook.indexOf("if (options.keepPreviousData && state.data != null) {")
    expect(keep).toBeGreaterThan(keyGuard)
    expect(hook).toContain("data: state.data, error: null, loading: true, stale: false, staleSince: null, previous: true")
    // 옵트인이 아니면 예전처럼 빈 로딩 상태.
    expect(hook).toContain("return { key: stateKey, ...EMPTY_STATE }")
  })

  it("장부는 summary·pipeline만 옵트인하고, DSH 카드는 breakdown이 실린 응답이 올 때까지 로딩으로 본다", () => {
    const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")
    expect(workbench.match(/keepPreviousData: true/g)).toHaveLength(2)
    expect(workbench).toContain("const dshBreakdownLoading = summary.loading && !(summary.data?.dsh_breakdown && summary.data.dsh_breakdown.length > 0)")
    expect(workbench.match(/loading=\{dshBreakdownLoading\}/g)).toHaveLength(3)
    expect(workbench).toContain("loading={dshRowsLoading}")
    // 갱신 중 표시: REV 카드·DSH·보드/콕핏, 요약 타일은 흐리게 + aria-busy.
    expect(workbench.match(/<RefreshingBadge \/>/g)).toHaveLength(3)
    expect(workbench).toContain("aria-busy={summary.previous ? true : undefined}")
  })

  it("RefreshingBadge는 상태(role=status)로 알린다", () => {
    const html = renderToStaticMarkup(<RefreshingBadge />)
    expect(html).toContain('role="status"')
    expect(html).toContain("갱신 중 — 직전 값 표시")
  })
})

describe("매트릭스 토스트(R-9·Q-14·Q-15)", () => {
  const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")

  it("정보는 role=status, 오류만 role=alert, 레일 위 z-[55]", () => {
    const render = sliceBetween(workbench, "{matrixToasts.length > 0 && (", '{sidePanelCollapsed && lens !== "cockpit" && (')
    expect(render).toContain('role={toast.kind === "error" ? "alert" : "status"}')
    expect(render).toContain("z-[55]")
    expect(render).not.toContain('role="alert"')
  })

  it("ttlMs를 따로 주지 않은 오류 토스트는 자동으로 사라지지 않는다", () => {
    const push = sliceBetween(workbench, "const pushMatrixToast = useCallback(", "const dismissMatrixToast = useCallback(")
    const sticky = push.indexOf('if (next.kind === "error" && next.ttlMs == null) return')
    const timer = push.indexOf("window.setTimeout(")
    expect(sticky).toBeGreaterThan(-1)
    expect(timer).toBeGreaterThan(sticky)
  })

  it("붙여넣기 결과 토스트(성공·부분 실패)에 '큐 열기'", () => {
    const confirm = sliceBetween(workbench, "const confirmMatrixPaste = useCallback(", "const toggleRevMonth = useCallback(")
    expect(confirm).toContain('label: "큐 열기"')
    expect(confirm.match(/action: openQueueAction/g)).toHaveLength(2)
  })
})
