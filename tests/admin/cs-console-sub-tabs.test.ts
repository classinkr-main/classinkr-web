import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { DEFAULT_TOOLS_SUB, OPERATING_TOOLS, TOOLS_SUBTABS } from "@/components/admin/cs-chat/constants"

// CS 콘솔 위계 재설계 P6 — 상담 Inbox 축 · 내부 운영 도구 축.
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md §5 URL 규약.
//
// `tab` = 콘솔 메뉴 층, `sub` = 화면 안쪽 층이라는 2단 계약을 두 화면에 적용한 결과를 고정한다.
// 렌더 테스트가 아니라 소스 계약 테스트다(이 저장소의 tests/admin 관례).

const inbox = readFileSync(join(process.cwd(), "app/admin/channel-talk/page.tsx"), "utf8")
const tools = readFileSync(
  join(process.cwd(), "components/admin/cs-chat/panels/ToolsPanel.tsx"),
  "utf8"
)

describe("상담 Inbox 하위탭 (P6)", () => {
  it("uses the shared AdminTabs + useUrlState('sub') instead of a bespoke tab widget", () => {
    expect(inbox).toContain('from "@/components/admin/AdminTabs"')
    expect(inbox).toContain('useUrlState("sub", DEFAULT_INBOX_SUB)')
    expect(inbox).toContain('variant="subtle"')
  })

  it("splits the screen into the three jobs it actually does", () => {
    for (const value of ["conversations", "trends", "faq"]) {
      expect(inbox).toContain(`activeSub === "${value}"`)
    }
    // 기본값은 상담 대화 — 이 화면의 본업(상담 → CRM 리드 등록)이다.
    expect(inbox).toContain('const DEFAULT_INBOX_SUB: InboxSub = "conversations"')
  })

  it("keeps sync / warning / notice / stat strip outside the tabs", () => {
    // 상시 노출 네 덩어리는 하위탭 분기보다 앞선다 — 어느 탭에서도 동기화와 요약이 보인다.
    const firstGate = inbox.indexOf('activeSub === "')
    expect(firstGate).toBeGreaterThan(-1)
    const alwaysOn = inbox.slice(0, firstGate)
    for (const anchor of ["지금 동기화", "CHANNEL_TALK_ACCESS", "전체 상담", "FAQ 후보"]) {
      expect(alwaysOn, anchor).toContain(anchor)
    }
  })

  it("consumes the conversation list through the admin cache so the nav warm-up can hit", () => {
    // warm 키 NAV_WARMUP_REQUESTS["/admin/channel-talk"]은 adminFetchJsonCached가 읽는 캐시에만 넣는다.
    expect(inbox).toContain('adminFetchJsonCached<ChannelData>("/api/admin/channel-talk"')
    expect(inbox).not.toContain('cache: "no-cache"')
  })
})

describe("운영 도구 하위탭 (P6)", () => {
  it("declares three sub tabs with the work item first", () => {
    expect(TOOLS_SUBTABS.map((item) => item.value)).toEqual(["regression", "metrics", "bridge"])
    expect(DEFAULT_TOOLS_SUB).toBe("regression")
    for (const value of TOOLS_SUBTABS.map((item) => item.value)) {
      expect(tools).toContain(`activeSub === "${value}"`)
    }
  })

  it("replaces the cross-section scrollIntoView jump with a sub-tab switch", () => {
    // 스탯 스트립(지표 탭)과 회귀 목록(회귀 검수 탭)이 다른 탭으로 갈리면서 점프가 성립하지 않는다.
    // 호출이 남지 않았는지만 본다 — 왜 없앴는지 설명하는 주석에는 이름이 그대로 등장한다.
    expect(tools).not.toContain("scrollIntoView(")
    expect(tools).toContain('onClick={() => setSubParam("regression")}')
  })

  it("lands each gap-queue stat card on its own source filter (인바운드 계약 1)", () => {
    expect(tools).toContain('href="/admin/docs?tab=gaps&source=chatbot"')
    expect(tools).toContain('href="/admin/docs?tab=gaps&source=internal_cs"')
    // source 없는 맨 링크는 더 이상 없다 — 두 카드가 같은 곳에 착지하던 상태를 되돌리지 않는다.
    expect(tools).not.toContain('href="/admin/docs?tab=gaps"')
  })

  it("keeps only the one shortcut that has no console menu equivalent", () => {
    // 6개 중 5개(보강 큐·추천 질문·채널톡·챗봇 대시보드·가이드 문서)는 CS 콘솔 가로 메뉴와
    // 목적지가 그대로 겹쳐 제거했다. 설정 연동만 콘솔 밖 표면이라 남는다.
    expect(OPERATING_TOOLS).toHaveLength(1)
    expect(OPERATING_TOOLS[0].href).toBe("/admin/settings?tab=integrations")
  })
})
