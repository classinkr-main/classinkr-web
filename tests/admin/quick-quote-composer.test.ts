import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin quick quote composer shell", () => {
  const source = readFileSync(
    join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"),
    "utf8"
  )

  it("renders the quick quote overlay through a body portal", () => {
    expect(source).toContain('import { createPortal } from "react-dom"')
    expect(source).toContain("createPortal(")
    expect(source).toContain('data-testid="quick-quote-composer-overlay"')
    expect(source).toContain("document.body")
  })

  it("locks background scroll while the composer is open", () => {
    expect(source).toContain("previousBodyOverflow")
    expect(source).toContain('document.body.style.overflow = "hidden"')
    expect(source).toContain("document.body.style.overflow = previousBodyOverflow")
  })

  it("keeps mobile footer actions compact", () => {
    expect(source).toContain("grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap")
    expect(source).toContain('className="hidden xl:hidden"')
  })
})
