import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// 통합 고객DB의 리드→NEO계정 중복 접기가 "배지 붙은 리드마다 단건 쿼리"로 되돌아가면
// 동시 쿼리 폭주가 재발한다(2026-09-04 프로덕션 REST 504 113건의 조건). 그 회귀를 막는다.
const repo = readFileSync(join(process.cwd(), "lib/repositories/crm-source-links.ts"), "utf8")
const unified = readFileSync(join(process.cwd(), "lib/repositories/crm-unified-customers.ts"), "utf8")

describe("listConfirmedLeadNeoAccountLinks — 벌크 지도", () => {
  it("external_account 링크만 좁힌다", () => {
    const fn = repo.slice(repo.indexOf("export async function listConfirmedLeadNeoAccountLinks"))
    const body = fn.slice(0, fn.indexOf("\n}\n"))
    // external_lead 의 target_id 는 계정 id 가 아니라 CRM 리드 레코드 id다 — 섞으면 엉뚱한 행이 사라진다.
    expect(body).toContain('.eq("target_type", "external_account")')
    expect(body).not.toContain("external_lead")
    expect(body).toContain('.eq("status", "confirmed")')
  })

  it("인덱스 선두 컬럼 술어를 유지한다", () => {
    const fn = repo.slice(repo.indexOf("export async function listConfirmedLeadNeoAccountLinks"))
    const body = fn.slice(0, fn.indexOf("\n}\n"))
    expect(body).toContain('.eq("source_system", "lead")')
    expect(body).toContain('.eq("source_object", "leads")')
  })

  it("PostgREST 1000행 절단을 페이지네이션으로 방어하고 상한 초과는 에러로 드러낸다", () => {
    const fn = repo.slice(repo.indexOf("export async function listConfirmedLeadNeoAccountLinks"))
    const body = fn.slice(0, fn.indexOf("\n}\n"))
    expect(body).toContain("LEAD_NEO_LINK_MAX_PAGES")
    expect(body).toContain(".range(from, from + LEAD_NEO_LINK_PAGE_SIZE - 1)")
    expect(body).toContain("초과했습니다")
  })
})

describe("crm-unified-customers — 폴드가 단건 반복으로 돌아가지 않는다", () => {
  it("벌크 지도를 쓰고 단건 조회를 반복하지 않는다", () => {
    expect(unified).toContain("listConfirmedLeadNeoAccountLinks()")
    expect(unified).not.toContain("findConfirmedLeadNeoLink(")
  })

  it("링크 조회 실패는 폴드만 건너뛰고 행을 지우지 않는다", () => {
    expect(unified).toContain("중복 표시될 수 있습니다")
  })
})
