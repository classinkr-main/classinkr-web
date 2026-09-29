// 고객 360 진입 링크 고정(2026-09-29 운영 장애 후속).
//  - 기록 화면 "{고객명} 상세로": 접두어 없는 원시 id 로 드로어를 열어 360 API 400 이던 폴백.
//  - 통합 고객 ?account= 딥링크: 드로어로 열 수 있는 키(lead:·neo:)만 연다.
//  - 통합 목록 상세 아이콘: 행마다 상세(360 전체 조회) 프리페치 금지.
//  - 상세 not-found: 공개 사이트 404 대신 어드민 안에서 통합 고객으로 돌려보낸다.
import fs from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import AdminCrmCustomerNotFound from "@/app/admin/crm/customers/[key]/not-found"
import { activityFocusBackHref } from "@/components/admin/crm/rail/activity-contract"
import { isDrawerCustomerKey } from "@/components/admin/crm/unified/shared"

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8")

describe("activityFocusBackHref", () => {
  it("리드·NEO 대상은 접두어를 붙인 드로어 키로 돌아간다", () => {
    expect(activityFocusBackHref({ back: "", targetType: "lead", targetId: "39f2b68c-6920", label: "학원" })).toBe(
      "/admin/crm/customers/unified?account=lead%3A39f2b68c-6920"
    )
    expect(activityFocusBackHref({ back: "", targetType: "neo_account", targetId: "3738042464338638", label: "" })).toBe(
      "/admin/crm/customers/unified?account=neo%3A3738042464338638"
    )
  })

  it("이미 접두어가 있는 id 는 그대로 쓴다", () => {
    expect(activityFocusBackHref({ back: "", targetType: undefined, targetId: "neo:42", label: "" })).toBe(
      "/admin/crm/customers/unified?account=neo%3A42"
    )
  })

  it("드로어로 열 수 없는 대상은 이름 검색으로, 이름도 없으면 목록으로 착지한다", () => {
    expect(activityFocusBackHref({ back: "", targetType: "customer", targetId: "c-1", label: "큰 학원" })).toBe(
      "/admin/crm/customers/unified?q=%ED%81%B0%20%ED%95%99%EC%9B%90"
    )
    expect(activityFocusBackHref({ back: "", targetType: undefined, targetId: "abc", label: "" })).toBe(
      "/admin/crm/customers/unified"
    )
  })

  it("back 은 어드민 내부 경로만 따른다", () => {
    expect(activityFocusBackHref({ back: "/admin/crm/deals", targetType: "lead", targetId: "x", label: "" })).toBe(
      "/admin/crm/deals"
    )
    expect(activityFocusBackHref({ back: "https://evil.example", targetType: "lead", targetId: "x", label: "" })).toBe(
      "/admin/crm/customers/unified?account=lead%3Ax"
    )
    expect(activityFocusBackHref({ back: "//evil.example/admin/", targetType: "lead", targetId: "x", label: "" })).toBe(
      "/admin/crm/customers/unified?account=lead%3Ax"
    )
  })
})

describe("isDrawerCustomerKey", () => {
  it("lead:·neo: 접두어 키만 드로어 키로 본다", () => {
    expect(isDrawerCustomerKey("lead:abc")).toBe(true)
    expect(isDrawerCustomerKey("neo:123")).toBe(true)
    expect(isDrawerCustomerKey("39f2b68c-6920")).toBe(false)
    expect(isDrawerCustomerKey("3738042464338638")).toBe(false)
    expect(isDrawerCustomerKey("customer:1")).toBe(false)
    expect(isDrawerCustomerKey("lead:")).toBe(false)
    expect(isDrawerCustomerKey(null)).toBe(false)
  })
})

describe("소스 계약", () => {
  it("기록 화면은 상세로 링크를 activityFocusBackHref 로만 만든다", () => {
    const source = read("components", "admin", "crm", "CrmActivityClient.tsx")
    expect(source).toContain("const backHref = activityFocusBackHref({")
    expect(source).not.toContain("unified?account=${encodeURIComponent(focusTargetId)}")
  })

  it("통합 고객은 ?account= 를 isDrawerCustomerKey 로 거른 뒤 드로어를 연다", () => {
    const source = read("components", "admin", "crm", "CrmUnifiedCustomersClient.tsx")
    expect(source).toContain('const accountParam = searchParams.get("account")')
    expect(source).toContain("const account = isDrawerCustomerKey(accountParam) ? accountParam : null")
  })

  it("통합 목록 상세 아이콘 링크는 프리페치하지 않는다", () => {
    const source = read("components", "admin", "crm", "unified", "CustomerResultsSection.tsx")
    const block = source.slice(source.indexOf("`/admin/crm/customers/${encodeURIComponent(row.key)}`"))
    expect(block.slice(0, 400)).toContain("prefetch={false}")
  })
})

describe("상세 not-found", () => {
  it("어드민 안에서 통합 고객으로 돌아가는 링크를 준다", () => {
    const html = renderToStaticMarkup(<AdminCrmCustomerNotFound />)
    expect(html).toContain("고객을 찾을 수 없습니다.")
    expect(html).toContain('href="/admin/crm/customers/unified"')
  })
})
