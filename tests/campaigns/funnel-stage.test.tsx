import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FunnelStage } from "@/components/admin/campaigns/FunnelStage"

describe("FunnelStage", () => {
  it("renders label and value", () => {
    const html = renderToStaticMarkup(<FunnelStage label="리드" value={42} />)
    expect(html).toContain("리드")
    expect(html).toContain("42")
  })

  it("shows a conversion rate when prevValue is given", () => {
    const html = renderToStaticMarkup(<FunnelStage label="신청" value={20} prevValue={40} />)
    expect(html).toContain("50%")
  })
})
