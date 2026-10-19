import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ClassInInternalAIIcon } from "@/components/ui/ClassInInternalAIIcon"

describe("ClassInInternalAIIcon", () => {
  it("renders default brand variant with 24x24 dimensions and SVG elements", () => {
    const html = renderToStaticMarkup(<ClassInInternalAIIcon />)

    expect(html).toContain("<svg")
    expect(html).toContain('viewBox="0 0 24 24"')
    expect(html).toContain('width="24"')
    expect(html).toContain('height="24"')
    expect(html).toContain('stroke="#084734"') // ClassIn Green shield border
    expect(html).toContain('fill="#084734"') // Core star
    expect(html).toContain('fill="#D97706"') // Gold assist sparkle
  })

  it("renders white variant for dark backgrounds", () => {
    const html = renderToStaticMarkup(<ClassInInternalAIIcon variant="white" size={18} />)

    expect(html).toContain('width="18"')
    expect(html).toContain('height="18"')
    expect(html).toContain('stroke="#FFFFFF"')
    expect(html).toContain('fill="#6EE7B7"')
    expect(html).toContain('fill="#FDE68A"')
  })

  it("renders dark variant for light backgrounds", () => {
    const html = renderToStaticMarkup(<ClassInInternalAIIcon variant="dark" />)

    expect(html).toContain('stroke="#31302E"')
    expect(html).toContain('fill="#10B981"')
  })

  it("renders duotone variant with soft green tinted surface fill", () => {
    const html = renderToStaticMarkup(<ClassInInternalAIIcon variant="duotone" />)

    expect(html).toContain('stroke="#084734"')
    expect(html).toContain('fill="rgba(236,253,245,0.75)"')
    expect(html).toContain('fill="#10B981"')
  })

  it("applies custom className", () => {
    const html = renderToStaticMarkup(<ClassInInternalAIIcon className="custom-test-class" />)

    expect(html).toContain("custom-test-class")
  })
})
