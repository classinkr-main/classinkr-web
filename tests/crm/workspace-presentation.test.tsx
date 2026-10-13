import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const viewport = vi.hoisted(() => ({ wide: false }))
vi.mock("@/components/admin/use-wide-workspace", () => ({ useWideWorkspace: () => viewport.wide }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import Customer360Drawer from "@/components/admin/crm/Customer360Drawer"
import ActivityQuickForm from "@/components/admin/crm/rail/ActivityQuickForm"

afterEach(() => { viewport.wide = false })

describe("CRM workspace accessibility", () => {
  it("keeps the mobile detail modal, including its modal semantics", () => {
    const html = renderToStaticMarkup(<Customer360Drawer presentation="workspace" customerKey="lead:test" name="테스트 학원" onClose={() => {}} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
  })

  it("wide list/detail workspace is a named region and does not claim modal isolation", () => {
    viewport.wide = true
    const html = renderToStaticMarkup(<Customer360Drawer presentation="workspace" customerKey="lead:test" name="테스트 학원" onClose={() => {}} />)
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-labelledby="crm-customer-drawer-title"')
    expect(html).not.toContain('aria-modal="true"')
  })

  it("default drawer consumers remain modal even on wide screens", () => {
    viewport.wide = true
    const html = renderToStaticMarkup(<Customer360Drawer customerKey="lead:test" onClose={() => {}} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
  })

  it("record workspace exposes customer, content and next action fields once, before saving", () => {
    const html = renderToStaticMarkup(<ActivityQuickForm variant="workspace" defaultTargetType="lead" defaultTargetId="test" defaultTargetLabel="테스트 학원" bodyFieldId="workspace-test-body" />)
    expect(html).toContain('id="workspace-test-body"')
    expect(html).toContain('aria-label="기록 내용"')
    expect(html.match(/aria-label="다음 액션"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="액션 예정일"')
    expect(html).toContain("기록 저장")
    expect(html).not.toContain("저장됨")
  })
})
