import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin docs alpha readiness surface", () => {
  it("exposes a guarded alpha readiness endpoint backed by docs and chatbot tables", () => {
    const routePath = join(process.cwd(), "app/api/admin/docs/alpha-readiness/route.ts")

    expect(existsSync(routePath)).toBe(true)

    const source = readFileSync(routePath, "utf8")
    expect(source).toContain("verifyAdmin")
    expect(source).toContain("ALPHA_DB_RPC_PROBES")
    expect(source).toContain("buildChatbotAlphaReadiness")
    expect(source).toContain("listDocGapBacklog")
    expect(source).toContain(".rpc(probe.functionName")
    expect(source).toContain("docs_ai_chunks")
    expect(source).toContain("chatbot_recommended_questions")
  })

  it("shows alpha readiness in the AI quality review tab", () => {
    // 이전 경로: 독립 page → 문서 센터 "보강 큐" 탭(DocsGapsPanel).
    // CS 콘솔 IA 재구성(cs-admin-console-ia-2026-07-27 §7)에서 챗봇 운영 대시보드와
    // 두 벌로 중복돼 있던 이 블록을 "AI 품질 검수" 탭(/admin/docs?tab=quality)으로 단일화했다.
    const source = readFileSync(
      join(process.cwd(), "components/admin/docs/DocsQualityPanel.tsx"),
      "utf8"
    )

    expect(source).toContain("/api/admin/docs/alpha-readiness")
    expect(source).toContain("알파 준비도")
    expect(source).toContain("Supabase 운영 연결")
    expect(source).toContain("챗봇 DB 스키마")
    expect(source).toContain("check.artifacts")
    // 품질 평가도 같은 화면에 합쳐졌다 — 두 실행 모드와 실패 목록이 살아 있어야 한다.
    expect(source).toContain("/api/admin/chatbot/eval")
    expect(source).toContain("빠른 회귀 평가")
    expect(source).toContain("심판 포함 평가")
    expect(source).toContain("회귀 확인 필요")
  })

  it("removes the duplicated blocks from their old homes (single entry point)", () => {
    const gaps = readFileSync(
      join(process.cwd(), "components/admin/docs/DocsGapsPanel.tsx"),
      "utf8"
    )
    const dashboard = readFileSync(
      join(process.cwd(), "components/admin/chatbot/ExternalChatbotOpsDashboard.tsx"),
      "utf8"
    )

    for (const source of [gaps, dashboard]) {
      expect(source).not.toContain("/api/admin/docs/alpha-readiness")
      expect(source).not.toContain("/api/admin/chatbot/eval")
    }
    // 보강 큐는 순수 미해결 큐로 남는다 — 질문 패턴·문서 없는 질문·결과 없는 검색어.
    expect(gaps).toContain("/api/admin/docs/gaps")
    expect(gaps).toContain("문서 없는 질문")
    // 대시보드는 운영 지표만 읽는다.
    expect(dashboard).toContain("/api/admin/chatbot/stats")
  })

  it("registers the quality tab on the docs page and the CS console menu", () => {
    const page = readFileSync(join(process.cwd(), "app/admin/docs/page.tsx"), "utf8")
    const nav = readFileSync(
      join(process.cwd(), "components/admin/cs/CsConsoleNav.tsx"),
      "utf8"
    )

    expect(page).toContain('{ value: "quality", label: "AI 품질 검수"')
    expect(page).toContain("DocsQualityPanel")

    // 가이드 문서 그룹에서만 보조 탭바를 렌더한다(§5). 멤버십으로 검증한다 —
    // 리터럴 문자열을 통째로 비교하면 그룹에 탭이 하나 늘 때마다 무관하게 깨진다
    // (P6에서 `성과`가 4번째 보조 탭으로 들어왔다).
    const guideGroup = page.match(
      /const DOCS_GUIDE_GROUP_TABS: readonly DocsTab\[\] = \[([\s\S]*?)\]/
    )?.[1]
    expect(guideGroup).toBeTruthy()
    for (const tab of ["documents", "categories", "redirects", "analytics"]) {
      expect(guideGroup).toContain(`"${tab}"`)
    }
    // 콘솔 가로 메뉴가 자기 층을 갖는 탭은 그룹에 들어가면 안 된다 — 들어가면
    // 그 화면 상단에 문서 CRUD 크롬이 다시 샌다(P6이 고친 바로 그 누수).
    for (const tab of ["recommended", "gaps", "quality"]) {
      expect(guideGroup).not.toContain(`"${tab}"`)
    }

    expect(nav).toContain('href: "/admin/docs?tab=quality"')
  })
})
