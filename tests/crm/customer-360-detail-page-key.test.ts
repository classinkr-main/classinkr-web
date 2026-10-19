// 고객 360 상세 페이지 키 정규화 고정(2026-09-29 운영 404).
// Next 16.2 는 동적 페이지 본문의 params 를 퍼센트 인코딩된 채(`lead%3A…`) 넘기고 generateMetadata 는 디코드된
// 값을 받는다 — 본문이 원문 키로 파싱해 notFound() 로 떨어지던 사고. 두 곳 모두 정규화한 키로 360 을 읽어야 한다.
import fs from "node:fs"
import path from "node:path"

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/repositories/crm-customer-360", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/crm-customer-360")>()
  return {
    ...actual,
    getCrmCustomer360: vi.fn(async (parsed: { source: string; entityId: string; targetType: string }) => ({
      found: true,
      key: `${parsed.source}:${parsed.entityId}`,
      header: { name: "테스트학원" },
    })),
  }
})
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
vi.mock("@/components/admin/crm/Customer360DetailClient", () => ({ default: () => null }))

const PAGE_PATH = path.join(process.cwd(), "app", "admin", "crm", "customers", "[key]", "page.tsx")

describe("/admin/crm/customers/[key] 키 정규화", () => {
  it("본문이 퍼센트 인코딩된 params 를 받아도 notFound 로 떨어지지 않고 디코드된 키를 넘긴다", async () => {
    const mod = await import("@/app/admin/crm/customers/[key]/page")
    const repo = await import("@/lib/repositories/crm-customer-360")

    const element = (await mod.default({ params: Promise.resolve({ key: "lead%3A39f2b68c-6920" }) })) as {
      props: { children: { props: { customerKey: string } } }
    }
    expect(element.props.children.props.customerKey).toBe("lead:39f2b68c-6920")
    expect(repo.getCrmCustomer360).toHaveBeenCalledWith(
      { source: "lead", entityId: "39f2b68c-6920", targetType: "lead" },
      expect.objectContaining({ dealsLimit: 200 })
    )

    const neo = (await mod.default({ params: Promise.resolve({ key: "neo%3A3738042464338638" }) })) as {
      props: { children: { props: { customerKey: string } } }
    }
    expect(neo.props.children.props.customerKey).toBe("neo:3738042464338638")
  })

  it("generateMetadata 는 디코드된 키·인코딩된 키 모두 같은 제목을 만든다", async () => {
    const mod = await import("@/app/admin/crm/customers/[key]/page")
    const decoded = await mod.generateMetadata({ params: Promise.resolve({ key: "lead:abc" }) })
    const encoded = await mod.generateMetadata({ params: Promise.resolve({ key: "lead%3Aabc" }) })
    expect(decoded.title).toBe("테스트학원 · 고객 360 | Admin CRM")
    expect(encoded.title).toBe(decoded.title)
  })

  it("소스 계약: 두 진입점 모두 normalizeUnifiedCustomerKeyParam 을 거쳐 360 을 읽는다", () => {
    const source = fs.readFileSync(PAGE_PATH, "utf8")
    const calls = source.match(/normalizeUnifiedCustomerKeyParam\(\(await params\)\.key\)/g) ?? []
    expect(calls).toHaveLength(2)
    expect(source).toContain("customerKey={key}")
  })
})
